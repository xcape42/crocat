-- Crocat 1.1.0 online multiplayer schema draft.
-- Apply to a Supabase project only after anonymous sign-ins are enabled.
-- Public tables are explicitly granted to authenticated because new Supabase
-- projects no longer expose new public tables to the Data API by default.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  game_mode text not null default 'split' check (game_mode in ('split')),
  status text not null default 'waiting' check (status in ('waiting','drawing','reveal','finished')),
  round_seconds integer not null default 180 check (round_seconds between 10 and 600),
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 18),
  role text not null check (role in ('HEAD','BODY')),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, role)
);

create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'drawing' check (status in ('drawing','reveal','finished')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('HEAD','BODY')),
  drawing jsonb not null,
  created_at timestamptz not null default now(),
  unique (round_id, player_id),
  unique (round_id, role)
);

create index if not exists rooms_code_idx on public.rooms(code);
create index if not exists rooms_host_id_idx on public.rooms(host_id);
create index if not exists room_players_user_idx on public.room_players(user_id);
create index if not exists game_rounds_room_idx on public.game_rounds(room_id, started_at desc);
create index if not exists submissions_round_idx on public.submissions(round_id);
create index if not exists submissions_player_id_idx on public.submissions(player_id);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_rounds enable row level security;
alter table public.submissions enable row level security;

create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_room_member(uuid) from public;
grant execute on function private.is_room_member(uuid) to authenticated;

drop policy if exists rooms_member_select on public.rooms;
create policy rooms_member_select
on public.rooms
for select
to authenticated
using (private.is_room_member(id));

drop policy if exists room_players_member_select on public.room_players;
create policy room_players_member_select
on public.room_players
for select
to authenticated
using (private.is_room_member(room_id));

drop policy if exists game_rounds_member_select on public.game_rounds;
create policy game_rounds_member_select
on public.game_rounds
for select
to authenticated
using (private.is_room_member(room_id));

drop policy if exists submissions_member_select on public.submissions;
create policy submissions_member_select
on public.submissions
for select
to authenticated
using (
  exists (
    select 1
    from public.game_rounds gr
    where gr.id = submissions.round_id
      and private.is_room_member(gr.room_id)
  )
);

revoke all on public.rooms, public.room_players, public.game_rounds, public.submissions from anon;
revoke insert, update, delete on public.rooms, public.room_players, public.game_rounds, public.submissions from authenticated;
grant select on public.rooms, public.room_players, public.game_rounds, public.submissions to authenticated;

create or replace function private.make_room_code()
returns text
language sql
volatile
security invoker
set search_path = pg_catalog
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

revoke all on function private.make_room_code() from public;
grant execute on function private.make_room_code() to authenticated;

create or replace function private.create_room_impl(
  p_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room_id uuid;
  v_code text;
  v_try integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  p_display_name := btrim(p_display_name);
  if char_length(p_display_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  p_round_seconds := greatest(10, least(coalesce(p_round_seconds, 180), 600));

  loop
    v_try := v_try + 1;
    v_code := private.make_room_code();
    begin
      insert into public.rooms(code, host_id, round_seconds)
      values (v_code, v_user, p_round_seconds)
      returning id into v_room_id;
      exit;
    exception when unique_violation then
      if v_try >= 8 then
        raise exception 'Could not allocate a room code';
      end if;
    end;
  end loop;

  insert into public.room_players(room_id, user_id, display_name, role)
  values (v_room_id, v_user, p_display_name, 'HEAD');

  return query select v_room_id, v_code, 'HEAD'::text;
end;
$$;

create or replace function private.join_room_impl(
  p_code text,
  p_display_name text
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  p_code := upper(btrim(p_code));
  p_display_name := btrim(p_display_name);

  if char_length(p_display_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.code = p_code
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'This room already started';
  end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then
    raise exception 'Room is full';
  end if;

  insert into public.room_players(room_id, user_id, display_name, role)
  values (v_room.id, v_user, p_display_name, 'BODY');

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$$;

create or replace function private.set_ready_impl(
  p_room_id uuid,
  p_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players
  set ready = coalesce(p_ready, false)
  where room_id = p_room_id
    and user_id = v_user;

  if not found then
    raise exception 'You are not a member of this room';
  end if;
end;
$$;

create or replace function private.start_round_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready integer;
  v_round public.game_rounds%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found or v_room.host_id <> v_user then
    raise exception 'Only the host can start the round';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not waiting';
  end if;

  select count(*) into v_ready
  from public.room_players
  where room_id = p_room_id and ready is true;

  if v_ready <> 2 then
    raise exception 'Both players must be ready';
  end if;

  insert into public.game_rounds(room_id, status, started_at, ends_at)
  values (
    p_room_id,
    'drawing',
    now(),
    now() + make_interval(secs => v_room.round_seconds)
  )
  returning * into v_round;

  update public.rooms set status = 'drawing' where id = p_room_id;

  return next v_round;
end;
$$;

create or replace function private.submit_drawing_impl(
  p_round_id uuid,
  p_role text,
  p_drawing jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_player public.room_players%rowtype;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then
    raise exception 'Round not found';
  end if;

  if v_round.status <> 'drawing' then
    raise exception 'Round is not accepting drawings';
  end if;

  select * into v_player
  from public.room_players
  where room_id = v_round.room_id
    and user_id = v_user;

  if not found or v_player.role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    raise exception 'Invalid drawing payload';
  end if;

  insert into public.submissions(round_id, player_id, role, drawing)
  values (p_round_id, v_user, p_role, p_drawing)
  on conflict (round_id, player_id)
  do update set drawing = excluded.drawing, created_at = now();

  select count(*) into v_count
  from public.submissions
  where round_id = p_round_id;

  if v_count >= 2 then
    update public.game_rounds set status = 'reveal' where id = p_round_id;
    update public.rooms set status = 'reveal' where id = v_round.room_id;
  end if;
end;
$$;

revoke all on function private.create_room_impl(text, integer) from public;
revoke all on function private.join_room_impl(text, text) from public;
revoke all on function private.set_ready_impl(uuid, boolean) from public;
revoke all on function private.start_round_impl(uuid) from public;
revoke all on function private.submit_drawing_impl(uuid, text, jsonb) from public;

grant execute on function private.create_room_impl(text, integer) to authenticated;
grant execute on function private.join_room_impl(text, text) to authenticated;
grant execute on function private.set_ready_impl(uuid, boolean) to authenticated;
grant execute on function private.start_round_impl(uuid) to authenticated;
grant execute on function private.submit_drawing_impl(uuid, text, jsonb) to authenticated;

create or replace function public.create_room(
  p_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.create_room_impl(p_display_name, p_round_seconds);
$$;

create or replace function public.join_room(
  p_code text,
  p_display_name text
)
returns table(room_id uuid, room_code text, player_role text)
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.join_room_impl(p_code, p_display_name);
$$;

create or replace function public.set_ready(p_room_id uuid, p_ready boolean)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.set_ready_impl(p_room_id, p_ready);
$$;

create or replace function public.start_round(p_room_id uuid)
returns setof public.game_rounds
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.start_round_impl(p_room_id);
$$;

create or replace function public.submit_drawing(
  p_round_id uuid,
  p_role text,
  p_drawing jsonb
)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.submit_drawing_impl(p_round_id, p_role, p_drawing);
$$;

revoke all on function public.create_room(text, integer) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.set_ready(uuid, boolean) from public, anon;
revoke all on function public.start_round(uuid) from public, anon;
revoke all on function public.submit_drawing(uuid, text, jsonb) from public, anon;

grant execute on function public.create_room(text, integer) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
grant execute on function public.start_round(uuid) to authenticated;
grant execute on function public.submit_drawing(uuid, text, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_players'
  ) then
    alter publication supabase_realtime add table public.room_players;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_rounds'
  ) then
    alter publication supabase_realtime add table public.game_rounds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'submissions'
  ) then
    alter publication supabase_realtime add table public.submissions;
  end if;
end
$$;
-- Crocat 1.2.0 persistent online room lifecycle.

alter table public.rooms
  add column if not exists next_round_at timestamptz;

alter table public.game_rounds
  add column if not exists revealed_at timestamptz;

create or replace function private.set_ready_impl(
  p_room_id uuid,
  p_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players rp
  set ready = coalesce(p_ready, false)
  from public.rooms r
  where rp.room_id = p_room_id
    and rp.user_id = v_user
    and r.id = rp.room_id
    and r.status in ('waiting', 'reveal');

  if not found then
    raise exception 'Ready check is unavailable for this room';
  end if;
end;
$$;

create or replace function private.start_round_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_ready integer;
  v_round public.game_rounds%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found or v_room.host_id <> v_user then
    raise exception 'Only the host can start the round';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not waiting';
  end if;

  select count(*) into v_ready
  from public.room_players rp
  where rp.room_id = p_room_id and rp.ready is true;

  if v_ready <> 2 then
    raise exception 'Both players must be ready';
  end if;

  insert into public.game_rounds(room_id, status, started_at, ends_at)
  values (
    p_room_id,
    'drawing',
    now(),
    now() + make_interval(secs => v_room.round_seconds)
  )
  returning * into v_round;

  update public.rooms
  set status = 'drawing',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;

  return next v_round;
end;
$$;

create or replace function private.submit_drawing_impl(
  p_round_id uuid,
  p_role text,
  p_drawing jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_player public.room_players%rowtype;
  v_count integer;
  v_revealed_at timestamptz;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.id = p_round_id
  for update;

  if not found then
    raise exception 'Round not found';
  end if;

  if v_round.status <> 'drawing' then
    raise exception 'Round is not accepting drawings';
  end if;

  select rp.* into v_player
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_user;

  if not found or v_player.role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    raise exception 'Invalid drawing payload';
  end if;

  insert into public.submissions(round_id, player_id, role, drawing)
  values (p_round_id, v_user, p_role, p_drawing)
  on conflict (round_id, player_id)
  do update set drawing = excluded.drawing, created_at = now();

  select count(*) into v_count
  from public.submissions s
  where s.round_id = p_round_id;

  if v_count >= 2 then
    v_revealed_at := now();

    update public.game_rounds
    set status = 'reveal',
        revealed_at = coalesce(revealed_at, v_revealed_at)
    where id = p_round_id
    returning revealed_at into v_revealed_at;

    update public.rooms
    set status = 'reveal',
        next_round_at = v_revealed_at + interval '30 seconds'
    where id = v_round.room_id;

    update public.room_players
    set ready = false
    where room_id = v_round.room_id;
  end if;
end;
$$;

create or replace function private.advance_round_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player_count integer;
  v_ready_count integer;
  v_round public.game_rounds%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  if v_room.status <> 'reveal' then
    return;
  end if;

  select count(*) into v_player_count
  from public.room_players rp
  where rp.room_id = p_room_id;

  if v_player_count < 2 then
    update public.game_rounds
    set status = 'finished'
    where room_id = p_room_id
      and status = 'reveal';

    update public.rooms
    set status = 'waiting',
        next_round_at = null
    where id = p_room_id;

    update public.room_players
    set ready = false
    where room_id = p_room_id;

    return;
  end if;

  select count(*) into v_ready_count
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.ready is true;

  if v_ready_count < 2
     and (v_room.next_round_at is null or now() < v_room.next_round_at) then
    return;
  end if;

  update public.game_rounds
  set status = 'finished'
  where room_id = p_room_id
    and status = 'reveal';

  insert into public.game_rounds(room_id, status, started_at, ends_at)
  values (
    p_room_id,
    'drawing',
    now(),
    now() + make_interval(secs => v_room.round_seconds)
  )
  returning * into v_round;

  update public.rooms
  set status = 'drawing',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;

  return next v_round;
end;
$$;

create or replace function private.leave_room_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    return;
  end if;

  if not private.is_room_member(p_room_id) then
    return;
  end if;

  if v_room.host_id = v_user then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_user;

  update public.game_rounds
  set status = 'finished'
  where room_id = p_room_id
    and status in ('drawing', 'reveal');

  update public.rooms
  set status = 'waiting',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$$;

revoke all on function private.advance_round_impl(uuid) from public;
revoke all on function private.leave_room_impl(uuid) from public;
grant execute on function private.advance_round_impl(uuid) to authenticated;
grant execute on function private.leave_room_impl(uuid) to authenticated;

create or replace function public.advance_round(p_room_id uuid)
returns setof public.game_rounds
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.advance_round_impl(p_room_id);
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.leave_room_impl(p_room_id);
$$;

revoke all on function public.advance_round(uuid) from public, anon;
revoke all on function public.leave_room(uuid) from public, anon;
grant execute on function public.advance_round(uuid) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;

-- Crocat 1.3.0 synchronized online adjustment phase.

alter table public.rooms
  drop constraint if exists rooms_status_check;

alter table public.rooms
  add constraint rooms_status_check
  check (status in ('waiting','drawing','adjusting','final_reveal','reveal','finished'));

alter table public.game_rounds
  drop constraint if exists game_rounds_status_check;

alter table public.game_rounds
  add constraint game_rounds_status_check
  check (status in ('drawing','adjusting','final_reveal','reveal','finished'));

alter table public.game_rounds
  add column if not exists adjustment_ends_at timestamptz,
  add column if not exists final_reveal_ends_at timestamptz;

alter table public.submissions
  add column if not exists transform jsonb not null
  default '{"x":0,"y":0,"scale":1}'::jsonb;

create or replace function private.set_ready_impl(
  p_room_id uuid,
  p_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players rp
  set ready = coalesce(p_ready, false)
  from public.rooms r
  where rp.room_id = p_room_id
    and rp.user_id = v_user
    and r.id = rp.room_id
    and r.status = 'waiting';

  if not found then
    raise exception 'Ready check is unavailable for this room';
  end if;
end;
$$;

create or replace function private.submit_drawing_impl(
  p_round_id uuid,
  p_role text,
  p_drawing jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_player public.room_players%rowtype;
  v_count integer;
  v_phase_started_at timestamptz;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.id = p_round_id
  for update;

  if not found then
    raise exception 'Round not found';
  end if;

  if v_round.status <> 'drawing' then
    raise exception 'Round is not accepting drawings';
  end if;

  select rp.* into v_player
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_user;

  if not found or v_player.role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    raise exception 'Invalid drawing payload';
  end if;

  insert into public.submissions(round_id, player_id, role, drawing, transform)
  values (
    p_round_id,
    v_user,
    p_role,
    p_drawing,
    '{"x":0,"y":0,"scale":1}'::jsonb
  )
  on conflict (round_id, player_id)
  do update set
    drawing = excluded.drawing,
    transform = '{"x":0,"y":0,"scale":1}'::jsonb,
    created_at = now();

  select count(*) into v_count
  from public.submissions s
  where s.round_id = p_round_id;

  if v_count >= 2 then
    v_phase_started_at := now();

    update public.game_rounds
    set status = 'adjusting',
        revealed_at = coalesce(revealed_at, v_phase_started_at),
        adjustment_ends_at = v_phase_started_at + interval '15 seconds',
        final_reveal_ends_at = v_phase_started_at + interval '30 seconds'
    where id = p_round_id;

    update public.rooms
    set status = 'adjusting',
        next_round_at = v_phase_started_at + interval '30 seconds'
    where id = v_round.room_id;

    update public.room_players
    set ready = false
    where room_id = v_round.room_id;
  end if;
end;
$$;

create or replace function private.save_transform_impl(
  p_round_id uuid,
  p_role text,
  p_transform jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_player public.room_players%rowtype;
  v_x numeric;
  v_y numeric;
  v_scale numeric;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.id = p_round_id
  for update;

  if not found then
    raise exception 'Round not found';
  end if;

  if v_round.status not in ('adjusting','final_reveal')
     or v_round.adjustment_ends_at is null
     or now() > v_round.adjustment_ends_at + interval '2 seconds' then
    raise exception 'Adjustment phase is closed';
  end if;

  select rp.* into v_player
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_user;

  if not found or v_player.role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_transform is null
     or jsonb_typeof(p_transform) <> 'object'
     or jsonb_typeof(p_transform->'x') <> 'number'
     or jsonb_typeof(p_transform->'y') <> 'number'
     or jsonb_typeof(p_transform->'scale') <> 'number' then
    raise exception 'Invalid transform payload';
  end if;

  v_x := (p_transform->>'x')::numeric;
  v_y := (p_transform->>'y')::numeric;
  v_scale := (p_transform->>'scale')::numeric;

  if v_x < -360 or v_x > 360
     or v_y < -760 or v_y > 760
     or v_scale < 0.75 or v_scale > 1.30 then
    raise exception 'Transform outside allowed range';
  end if;

  update public.submissions s
  set transform = jsonb_build_object(
    'x', v_x,
    'y', v_y,
    'scale', v_scale
  )
  where s.round_id = p_round_id
    and s.player_id = v_user
    and s.role = p_role;

  if not found then
    raise exception 'Submission not found';
  end if;
end;
$$;

create or replace function private.advance_phase_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_round public.game_rounds%rowtype;
  v_player_count integer;
  v_new_round public.game_rounds%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.room_id = p_room_id
    and gr.status in ('adjusting','final_reveal','reveal')
  order by gr.started_at desc
  limit 1
  for update;

  if not found then
    return;
  end if;

  select count(*) into v_player_count
  from public.room_players rp
  where rp.room_id = p_room_id;

  if v_player_count < 2 then
    update public.game_rounds
    set status = 'finished'
    where id = v_round.id;

    update public.rooms
    set status = 'waiting',
        next_round_at = null
    where id = p_room_id;

    update public.room_players
    set ready = false
    where room_id = p_room_id;

    return;
  end if;

  if v_round.status = 'adjusting'
     and v_round.adjustment_ends_at is not null
     and now() >= v_round.adjustment_ends_at then
    update public.game_rounds
    set status = 'final_reveal'
    where id = v_round.id;

    update public.rooms
    set status = 'final_reveal'
    where id = p_room_id;

    v_round.status := 'final_reveal';
  end if;

  if v_round.status in ('final_reveal','reveal')
     and v_round.final_reveal_ends_at is not null
     and now() >= v_round.final_reveal_ends_at then
    update public.game_rounds
    set status = 'finished'
    where id = v_round.id;

    insert into public.game_rounds(room_id, status, started_at, ends_at)
    values (
      p_room_id,
      'drawing',
      now(),
      now() + make_interval(secs => v_room.round_seconds)
    )
    returning * into v_new_round;

    update public.rooms
    set status = 'drawing',
        next_round_at = null
    where id = p_room_id;

    update public.room_players
    set ready = false
    where room_id = p_room_id;

    return next v_new_round;
  end if;
end;
$$;

create or replace function private.leave_room_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    return;
  end if;

  if not private.is_room_member(p_room_id) then
    return;
  end if;

  if v_room.host_id = v_user then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_user;

  update public.game_rounds
  set status = 'finished'
  where room_id = p_room_id
    and status in ('drawing','adjusting','final_reveal','reveal');

  update public.rooms
  set status = 'waiting',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$$;

revoke all on function private.save_transform_impl(uuid, text, jsonb) from public;
revoke all on function private.advance_phase_impl(uuid) from public;
grant execute on function private.save_transform_impl(uuid, text, jsonb) to authenticated;
grant execute on function private.advance_phase_impl(uuid) to authenticated;

create or replace function public.save_transform(
  p_round_id uuid,
  p_role text,
  p_transform jsonb
)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.save_transform_impl(p_round_id, p_role, p_transform);
$$;

create or replace function public.advance_phase(p_room_id uuid)
returns setof public.game_rounds
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.advance_phase_impl(p_room_id);
$$;

revoke all on function public.save_transform(uuid, text, jsonb) from public, anon;
revoke all on function public.advance_phase(uuid) from public, anon;
grant execute on function public.save_transform(uuid, text, jsonb) to authenticated;
grant execute on function public.advance_phase(uuid) to authenticated;

-- Crocat 1.3.0 transform validation hardening.
create or replace function private.save_transform_impl(
  p_round_id uuid,
  p_role text,
  p_transform jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_player public.room_players%rowtype;
  v_x numeric;
  v_y numeric;
  v_scale numeric;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.id = p_round_id
  for update;

  if not found then
    raise exception 'Round not found';
  end if;

  if v_round.status not in ('adjusting','final_reveal')
     or v_round.adjustment_ends_at is null
     or now() > v_round.adjustment_ends_at + interval '2 seconds' then
    raise exception 'Adjustment phase is closed';
  end if;

  select rp.* into v_player
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_user;

  if not found or v_player.role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_transform is null
     or jsonb_typeof(p_transform) <> 'object'
     or coalesce(jsonb_typeof(p_transform->'x'), '') <> 'number'
     or coalesce(jsonb_typeof(p_transform->'y'), '') <> 'number'
     or coalesce(jsonb_typeof(p_transform->'scale'), '') <> 'number' then
    raise exception 'Invalid transform payload';
  end if;

  v_x := (p_transform->>'x')::numeric;
  v_y := (p_transform->>'y')::numeric;
  v_scale := (p_transform->>'scale')::numeric;

  if v_x < -360 or v_x > 360
     or v_y < -760 or v_y > 760
     or v_scale < 0.75 or v_scale > 1.30 then
    raise exception 'Transform outside allowed range';
  end if;

  update public.submissions s
  set transform = jsonb_build_object(
    'x', v_x,
    'y', v_y,
    'scale', v_scale
  )
  where s.round_id = p_round_id
    and s.player_id = v_user
    and s.role = p_role;

  if not found then
    raise exception 'Submission not found';
  end if;
end;
$$;

-- Crocat 1.3.1 guest-only ready flow.
create or replace function private.set_ready_impl(
  p_room_id uuid,
  p_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players rp
  set ready = coalesce(p_ready, false)
  from public.rooms r
  where rp.room_id = p_room_id
    and rp.user_id = v_user
    and r.id = rp.room_id
    and r.status = 'waiting'
    and r.host_id <> v_user;

  if not found then
    raise exception 'Only the guest can change ready state while the room is waiting';
  end if;
end;
$$;

create or replace function private.start_round_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player_count integer;
  v_guest_ready integer;
  v_round public.game_rounds%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found or v_room.host_id <> v_user then
    raise exception 'Only the host can start the round';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not waiting';
  end if;

  select count(*) into v_player_count
  from public.room_players rp
  where rp.room_id = p_room_id;

  if v_player_count <> 2 then
    raise exception 'Two players are required';
  end if;

  select count(*) into v_guest_ready
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.user_id <> v_room.host_id
    and rp.ready is true;

  if v_guest_ready <> 1 then
    raise exception 'Guest must be ready';
  end if;

  insert into public.game_rounds(room_id, status, started_at, ends_at)
  values (
    p_room_id,
    'drawing',
    now(),
    now() + make_interval(secs => v_room.round_seconds)
  )
  returning * into v_round;

  update public.rooms
  set status = 'drawing',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;

  return next v_round;
end;
$$;

-- Crocat 1.3.2 join-or-create rooms and Final Reveal ready skip.

create or replace function private.join_or_create_room_impl(
  p_code text,
  p_host_display_name text,
  p_guest_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_host_name text := btrim(p_host_display_name);
  v_guest_name text := btrim(p_guest_display_name);
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
  v_room_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Room code must contain exactly 6 letters or numbers';
  end if;
  if char_length(v_host_name) not between 2 and 18
     or char_length(v_guest_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  p_round_seconds := greatest(10, least(coalesce(p_round_seconds, 180), 600));
  perform pg_advisory_xact_lock(hashtext(v_code)::bigint);

  select r.* into v_room
  from public.rooms r
  where r.code = v_code
  for update;

  if not found then
    insert into public.rooms(code, host_id, round_seconds)
    values (v_code, v_user, p_round_seconds)
    returning id into v_room_id;

    insert into public.room_players(room_id, user_id, display_name, role)
    values (v_room_id, v_user, v_host_name, 'HEAD');

    return query select v_room_id, v_code, 'HEAD'::text;
    return;
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  insert into public.room_players(room_id, user_id, display_name, role)
  values (v_room.id, v_user, v_guest_name, 'BODY');

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$$;

revoke all on function private.join_or_create_room_impl(text,text,text,integer) from public;
grant execute on function private.join_or_create_room_impl(text,text,text,integer) to authenticated;

create or replace function public.join_or_create_room(
  p_code text,
  p_host_display_name text,
  p_guest_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.join_or_create_room_impl(
    p_code,
    p_host_display_name,
    p_guest_display_name,
    p_round_seconds
  );
$$;

revoke all on function public.join_or_create_room(text,text,text,integer) from public, anon;
grant execute on function public.join_or_create_room(text,text,text,integer) to authenticated;

create or replace function private.set_ready_impl(
  p_room_id uuid,
  p_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  update public.room_players rp
  set ready = coalesce(p_ready, false)
  from public.rooms r
  where rp.room_id = p_room_id
    and rp.user_id = v_user
    and r.id = rp.room_id
    and (
      (r.status = 'waiting' and r.host_id <> v_user)
      or r.status in ('final_reveal','reveal')
    );

  if not found then
    raise exception 'Ready state is unavailable for this player in the current phase';
  end if;
end;
$$;

create or replace function private.advance_phase_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_round public.game_rounds%rowtype;
  v_player_count integer;
  v_ready_count integer;
  v_new_round public.game_rounds%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.room_id = p_room_id
    and gr.status in ('adjusting','final_reveal','reveal')
  order by gr.started_at desc
  limit 1
  for update;

  if not found then return; end if;

  select count(*) into v_player_count
  from public.room_players rp
  where rp.room_id = p_room_id;

  if v_player_count < 2 then
    update public.game_rounds set status = 'finished' where id = v_round.id;
    update public.rooms set status = 'waiting', next_round_at = null where id = p_room_id;
    update public.room_players set ready = false where room_id = p_room_id;
    return;
  end if;

  if v_round.status = 'adjusting'
     and v_round.adjustment_ends_at is not null
     and now() >= v_round.adjustment_ends_at then
    update public.game_rounds set status = 'final_reveal' where id = v_round.id;
    update public.rooms set status = 'final_reveal' where id = p_room_id;
    update public.room_players set ready = false where room_id = p_room_id;
    v_round.status := 'final_reveal';
  end if;

  if v_round.status in ('final_reveal','reveal') then
    select count(*) into v_ready_count
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.ready is true;

    if v_ready_count >= 2
       or (
         v_round.final_reveal_ends_at is not null
         and now() >= v_round.final_reveal_ends_at
       ) then
      update public.game_rounds set status = 'finished' where id = v_round.id;

      insert into public.game_rounds(room_id, status, started_at, ends_at)
      values (
        p_room_id,
        'drawing',
        now(),
        now() + make_interval(secs => v_room.round_seconds)
      )
      returning * into v_new_round;

      update public.rooms set status = 'drawing', next_round_at = null where id = p_room_id;
      update public.room_players set ready = false where room_id = p_room_id;

      return next v_new_round;
    end if;
  end if;
end;
$$;

-- Crocat 1.3.3 host-controlled room game settings.
create or replace function private.update_room_settings_impl(
  p_room_id uuid,
  p_round_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_seconds integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;
  if v_room.host_id <> v_user then raise exception 'Only the host can change room settings'; end if;
  if v_room.status <> 'waiting' then raise exception 'Room settings can only be changed while waiting'; end if;

  v_seconds := greatest(10, least(coalesce(p_round_seconds, v_room.round_seconds), 600));

  update public.rooms
  set round_seconds = v_seconds
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id
    and user_id <> v_user;
end;
$$;

revoke all on function private.update_room_settings_impl(uuid,integer) from public;
grant execute on function private.update_room_settings_impl(uuid,integer) to authenticated;

create or replace function public.update_room_settings(
  p_room_id uuid,
  p_round_seconds integer
)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.update_room_settings_impl(p_room_id, p_round_seconds);
$$;

revoke all on function public.update_room_settings(uuid,integer) from public, anon;
grant execute on function public.update_room_settings(uuid,integer) to authenticated;

-- Crocat 1.4.0 random roles, themed prompts and reversible submissions.

create table if not exists private.drawing_prompts (
  theme text not null,
  term text not null,
  primary key (theme, term)
);

insert into private.drawing_prompts(theme, term) values
  ('Animals','Lion'),('Animals','Frog'),('Animals','Owl'),('Animals','Shark'),('Animals','Penguin'),('Animals','Giraffe'),
  ('Professions','Firefighter'),('Professions','Astronaut'),('Professions','Baker'),('Professions','Gardener'),('Professions','Doctor'),('Professions','Detective'),
  ('Food','Pizza'),('Food','Burger'),('Food','Sushi'),('Food','Pretzel'),('Food','Ice Cream'),('Food','Taco'),
  ('Fantasy','Dragon'),('Fantasy','Wizard'),('Fantasy','Witch'),('Fantasy','Troll'),('Fantasy','Unicorn'),('Fantasy','Knight'),
  ('Vehicles','Bicycle'),('Vehicles','Tractor'),('Vehicles','Rocket'),('Vehicles','Submarine'),('Vehicles','Skateboard'),('Vehicles','Bus'),
  ('Objects','Toaster'),('Objects','Umbrella'),('Objects','Backpack'),('Objects','Lamp'),('Objects','Clock'),('Objects','Vacuum Cleaner')
on conflict do nothing;

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check
  check (status in ('waiting','prompt_select','drawing','adjusting','final_reveal','reveal','finished'));

alter table public.game_rounds drop constraint if exists game_rounds_status_check;
alter table public.game_rounds
  add constraint game_rounds_status_check
  check (status in ('prompt_select','drawing','adjusting','final_reveal','reveal','finished'));

alter table public.room_players drop constraint if exists room_players_room_id_role_key;
alter table public.room_players
  add constraint room_players_room_id_role_key
  unique (room_id, role)
  deferrable initially deferred;

alter table public.game_rounds
  add column if not exists head_player_id uuid references auth.users(id) on delete cascade,
  add column if not exists body_player_id uuid references auth.users(id) on delete cascade,
  add column if not exists prompt_options jsonb not null default '[]'::jsonb,
  add column if not exists prompt_term text,
  add column if not exists prompt_theme text,
  add column if not exists prompt_selection_ends_at timestamptz,
  add column if not exists prompt_reroll_used boolean not null default false;

alter table public.submissions
  add column if not exists submitted boolean not null default true;

create index if not exists game_rounds_head_player_id_idx on public.game_rounds(head_player_id);
create index if not exists game_rounds_body_player_id_idx on public.game_rounds(body_player_id);


CREATE OR REPLACE FUNCTION private.random_prompt_options()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  with chosen_themes as (
    select theme
    from private.drawing_prompts
    group by theme
    order by random()
    limit 3
  ),
  chosen as (
    select
      ct.theme,
      (
        select dp.term
        from private.drawing_prompts dp
        where dp.theme = ct.theme
        order by random()
        limit 1
      ) as term
    from chosen_themes ct
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('theme', theme, 'term', term)),
    '[]'::jsonb
  )
  from chosen;
$function$;

CREATE OR REPLACE FUNCTION private.start_round_impl(p_room_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player_count integer;
  v_guest_ready integer;
  v_head uuid;
  v_body uuid;
  v_round public.game_rounds%rowtype;
  v_deadline timestamptz := now() + interval '15 seconds';
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found or v_room.host_id <> v_user then
    raise exception 'Only the host can start the round';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not waiting';
  end if;

  select count(*) into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count <> 2 then
    raise exception 'Two players are required';
  end if;

  select count(*) into v_guest_ready
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_room.host_id
    and ready is true;

  if v_guest_ready <> 1 then
    raise exception 'Guest must be ready';
  end if;

  select user_id into v_head
  from public.room_players
  where room_id = p_room_id
  order by random()
  limit 1;

  select user_id into v_body
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_head
  limit 1;

  set constraints room_players_room_id_role_key deferred;

  update public.room_players
  set role = case when user_id = v_head then 'HEAD' else 'BODY' end,
      ready = false
  where room_id = p_room_id;

  insert into public.game_rounds(
    room_id,
    status,
    started_at,
    ends_at,
    head_player_id,
    body_player_id,
    prompt_options,
    prompt_selection_ends_at
  )
  values (
    p_room_id,
    'prompt_select',
    now(),
    v_deadline,
    v_head,
    v_body,
    private.random_prompt_options(),
    v_deadline
  )
  returning * into v_round;

  update public.rooms
  set status = 'prompt_select',
      next_round_at = null
  where id = p_room_id;

  return next v_round;
end;
$function$;

CREATE OR REPLACE FUNCTION private.select_prompt_impl(p_round_id uuid, p_term text)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_room public.rooms%rowtype;
  v_option jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'prompt_select' then raise exception 'Prompt selection is closed'; end if;
  if v_round.head_player_id <> v_user then raise exception 'Only the HEAD player can choose the prompt'; end if;
  if now() > v_round.prompt_selection_ends_at then raise exception 'Prompt selection time expired'; end if;

  select value into v_option
  from jsonb_array_elements(v_round.prompt_options)
  where value->>'term' = p_term
  limit 1;

  if v_option is null then raise exception 'Prompt is not one of the current options'; end if;

  select * into v_room
  from public.rooms
  where id = v_round.room_id
  for update;

  update public.game_rounds
  set prompt_term = v_option->>'term',
      prompt_theme = v_option->>'theme',
      status = 'drawing',
      started_at = now(),
      ends_at = now() + make_interval(secs => v_room.round_seconds)
  where id = p_round_id
  returning * into v_round;

  update public.rooms
  set status = 'drawing'
  where id = v_round.room_id;

  return next v_round;
end;
$function$;

CREATE OR REPLACE FUNCTION private.reroll_prompt_impl(p_round_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_options jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'prompt_select' then raise exception 'Prompt selection is closed'; end if;
  if v_round.head_player_id <> v_user then raise exception 'Only the HEAD player can reroll prompts'; end if;
  if v_round.prompt_reroll_used then raise exception 'Prompt reroll already used'; end if;
  if now() > v_round.prompt_selection_ends_at then raise exception 'Prompt selection time expired'; end if;

  with old_terms as (
    select value->>'term' as term
    from jsonb_array_elements(v_round.prompt_options)
  ),
  chosen_themes as (
    select dp.theme
    from private.drawing_prompts dp
    where dp.term not in (select term from old_terms)
    group by dp.theme
    order by random()
    limit 3
  ),
  chosen as (
    select
      ct.theme,
      (
        select dp.term
        from private.drawing_prompts dp
        where dp.theme = ct.theme
          and dp.term not in (select term from old_terms)
        order by random()
        limit 1
      ) as term
    from chosen_themes ct
  )
  select jsonb_agg(jsonb_build_object('theme', theme, 'term', term))
  into v_options
  from chosen;

  update public.game_rounds
  set prompt_options = v_options,
      prompt_reroll_used = true
  where id = p_round_id
  returning * into v_round;

  return next v_round;
end;
$function$;

CREATE OR REPLACE FUNCTION private.advance_prompt_impl(p_round_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_room public.rooms%rowtype;
  v_option jsonb;
  v_index integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if not private.is_room_member(v_round.room_id) then
    raise exception 'You are not a member of this room';
  end if;

  if v_round.status <> 'prompt_select' then
    return next v_round;
    return;
  end if;

  if now() < v_round.prompt_selection_ends_at then
    return;
  end if;

  v_index := floor(random() * jsonb_array_length(v_round.prompt_options))::integer;
  v_option := v_round.prompt_options->v_index;

  select * into v_room
  from public.rooms
  where id = v_round.room_id
  for update;

  update public.game_rounds
  set prompt_term = v_option->>'term',
      prompt_theme = v_option->>'theme',
      status = 'drawing',
      started_at = now(),
      ends_at = now() + make_interval(secs => v_room.round_seconds)
  where id = p_round_id
  returning * into v_round;

  update public.rooms
  set status = 'drawing'
  where id = v_round.room_id;

  return next v_round;
end;
$function$;

CREATE OR REPLACE FUNCTION private.submit_drawing_impl(p_round_id uuid, p_role text, p_drawing jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_expected_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'drawing' then raise exception 'Round is not accepting drawings'; end if;

  v_expected_role := case
    when v_round.head_player_id = v_user then 'HEAD'
    when v_round.body_player_id = v_user then 'BODY'
    else null
  end;

  if v_expected_role is null or v_expected_role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    raise exception 'Invalid drawing payload';
  end if;

  insert into public.submissions(
    round_id, player_id, role, drawing, transform, submitted
  )
  values (
    p_round_id,
    v_user,
    p_role,
    p_drawing,
    '{"x":0,"y":0,"scale":1}'::jsonb,
    true
  )
  on conflict (round_id, player_id)
  do update set
    drawing = excluded.drawing,
    transform = '{"x":0,"y":0,"scale":1}'::jsonb,
    submitted = true,
    created_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION private.resume_drawing_impl(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'drawing' or now() >= v_round.ends_at then
    raise exception 'Drawing can no longer be resumed';
  end if;

  update public.submissions
  set submitted = false
  where round_id = p_round_id
    and player_id = v_user;

  if not found then raise exception 'No submitted drawing to resume'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.advance_drawing_impl(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_count integer;
  v_phase_started_at timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if not private.is_room_member(v_round.room_id) then
    raise exception 'You are not a member of this room';
  end if;

  if v_round.status <> 'drawing' then return; end if;
  if now() < v_round.ends_at then return; end if;

  select count(*) into v_count
  from public.submissions
  where round_id = p_round_id;

  if v_count < 2 then return; end if;

  v_phase_started_at := now();

  update public.game_rounds
  set status = 'adjusting',
      revealed_at = coalesce(revealed_at, v_phase_started_at),
      adjustment_ends_at = v_phase_started_at + interval '15 seconds',
      final_reveal_ends_at = v_phase_started_at + interval '30 seconds'
  where id = p_round_id;

  update public.rooms
  set status = 'adjusting',
      next_round_at = v_phase_started_at + interval '30 seconds'
  where id = v_round.room_id;

  update public.room_players
  set ready = false
  where room_id = v_round.room_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_transform_impl(p_round_id uuid, p_role text, p_transform jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_expected_role text;
  v_x numeric;
  v_y numeric;
  v_scale numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;

  if v_round.status not in ('adjusting','final_reveal')
     or v_round.adjustment_ends_at is null
     or now() > v_round.adjustment_ends_at + interval '2 seconds' then
    raise exception 'Adjustment phase is closed';
  end if;

  v_expected_role := case
    when v_round.head_player_id = v_user then 'HEAD'
    when v_round.body_player_id = v_user then 'BODY'
    else null
  end;

  if v_expected_role is null or v_expected_role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_transform is null
     or jsonb_typeof(p_transform) <> 'object'
     or coalesce(jsonb_typeof(p_transform->'x'), '') <> 'number'
     or coalesce(jsonb_typeof(p_transform->'y'), '') <> 'number'
     or coalesce(jsonb_typeof(p_transform->'scale'), '') <> 'number' then
    raise exception 'Invalid transform payload';
  end if;

  v_x := (p_transform->>'x')::numeric;
  v_y := (p_transform->>'y')::numeric;
  v_scale := (p_transform->>'scale')::numeric;

  if v_x < -360 or v_x > 360
     or v_y < -760 or v_y > 760
     or v_scale < 0.75 or v_scale > 1.30 then
    raise exception 'Transform outside allowed range';
  end if;

  update public.submissions
  set transform = jsonb_build_object('x', v_x, 'y', v_y, 'scale', v_scale)
  where round_id = p_round_id
    and player_id = v_user
    and role = p_role;

  if not found then raise exception 'Submission not found'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.advance_phase_impl(p_room_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_round public.game_rounds%rowtype;
  v_player_count integer;
  v_ready_count integer;
  v_head uuid;
  v_body uuid;
  v_new_round public.game_rounds%rowtype;
  v_deadline timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;

  select * into v_round
  from public.game_rounds
  where room_id = p_room_id
    and status in ('adjusting','final_reveal','reveal')
  order by created_at desc
  limit 1
  for update;

  if not found then return; end if;

  select count(*) into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count < 2 then
    update public.game_rounds set status = 'finished' where id = v_round.id;
    update public.rooms set status = 'waiting', next_round_at = null where id = p_room_id;
    update public.room_players set ready = false where room_id = p_room_id;
    return;
  end if;

  if v_round.status = 'adjusting'
     and v_round.adjustment_ends_at is not null
     and now() >= v_round.adjustment_ends_at then
    update public.game_rounds set status = 'final_reveal' where id = v_round.id;
    update public.rooms set status = 'final_reveal' where id = p_room_id;
    update public.room_players set ready = false where room_id = p_room_id;
    v_round.status := 'final_reveal';
  end if;

  if v_round.status in ('final_reveal','reveal') then
    select count(*) into v_ready_count
    from public.room_players
    where room_id = p_room_id
      and ready is true;

    if v_ready_count >= 2
       or (
         v_round.final_reveal_ends_at is not null
         and now() >= v_round.final_reveal_ends_at
       ) then
      update public.game_rounds set status = 'finished' where id = v_round.id;

      select user_id into v_head
      from public.room_players
      where room_id = p_room_id
      order by random()
      limit 1;

      select user_id into v_body
      from public.room_players
      where room_id = p_room_id
        and user_id <> v_head
      limit 1;

      set constraints room_players_room_id_role_key deferred;

      update public.room_players
      set role = case when user_id = v_head then 'HEAD' else 'BODY' end,
          ready = false
      where room_id = p_room_id;

      v_deadline := now() + interval '15 seconds';

      insert into public.game_rounds(
        room_id,
        status,
        started_at,
        ends_at,
        head_player_id,
        body_player_id,
        prompt_options,
        prompt_selection_ends_at
      )
      values (
        p_room_id,
        'prompt_select',
        now(),
        v_deadline,
        v_head,
        v_body,
        private.random_prompt_options(),
        v_deadline
      )
      returning * into v_new_round;

      update public.rooms
      set status = 'prompt_select',
          next_round_at = null
      where id = p_room_id;

      return next v_new_round;
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.leave_room_impl(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then return; end if;
  if not private.is_room_member(p_room_id) then return; end if;

  if v_room.host_id = v_user then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_user;

  update public.game_rounds
  set status = 'finished'
  where room_id = p_room_id
    and status in ('prompt_select','drawing','adjusting','final_reveal','reveal');

  update public.rooms
  set status = 'waiting',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.select_prompt(p_round_id uuid, p_term text)
 RETURNS SETOF game_rounds
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select * from private.select_prompt_impl(p_round_id, p_term); $function$;

CREATE OR REPLACE FUNCTION public.reroll_prompt(p_round_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select * from private.reroll_prompt_impl(p_round_id); $function$;

CREATE OR REPLACE FUNCTION public.advance_prompt(p_round_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select * from private.advance_prompt_impl(p_round_id); $function$;

CREATE OR REPLACE FUNCTION public.resume_drawing(p_round_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.resume_drawing_impl(p_round_id); $function$;

CREATE OR REPLACE FUNCTION public.advance_drawing(p_round_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.advance_drawing_impl(p_round_id); $function$;


revoke all on function private.random_prompt_options() from public;
revoke all on function private.select_prompt_impl(uuid,text) from public;
revoke all on function private.reroll_prompt_impl(uuid) from public;
revoke all on function private.advance_prompt_impl(uuid) from public;
revoke all on function private.resume_drawing_impl(uuid) from public;
revoke all on function private.advance_drawing_impl(uuid) from public;

grant execute on function private.select_prompt_impl(uuid,text) to authenticated;
grant execute on function private.reroll_prompt_impl(uuid) to authenticated;
grant execute on function private.advance_prompt_impl(uuid) to authenticated;
grant execute on function private.resume_drawing_impl(uuid) to authenticated;
grant execute on function private.advance_drawing_impl(uuid) to authenticated;

revoke all on function public.select_prompt(uuid,text) from public, anon;
revoke all on function public.reroll_prompt(uuid) from public, anon;
revoke all on function public.advance_prompt(uuid) from public, anon;
revoke all on function public.resume_drawing(uuid) from public, anon;
revoke all on function public.advance_drawing(uuid) from public, anon;

grant execute on function public.select_prompt(uuid,text) to authenticated;
grant execute on function public.reroll_prompt(uuid) to authenticated;
grant execute on function public.advance_prompt(uuid) to authenticated;
grant execute on function public.resume_drawing(uuid) to authenticated;
grant execute on function public.advance_drawing(uuid) to authenticated;



-- Crocat post-1.4.0 targeted patch: Adjustment Ready only.
CREATE OR REPLACE FUNCTION private.set_ready_impl(p_room_id uuid, p_ready boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  update public.room_players rp
  set ready = coalesce(p_ready, false)
  from public.rooms r
  where rp.room_id = p_room_id
    and rp.user_id = v_user
    and r.id = rp.room_id
    and (
      (r.status = 'waiting' and r.host_id <> v_user)
      or r.status in ('adjusting','final_reveal','reveal')
    );

  if not found then
    raise exception 'Ready state is unavailable for this player in the current phase';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.advance_phase_impl(p_room_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_round public.game_rounds%rowtype;
  v_player_count integer;
  v_ready_count integer;
  v_head uuid;
  v_body uuid;
  v_new_round public.game_rounds%rowtype;
  v_deadline timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;

  select * into v_round
  from public.game_rounds
  where room_id = p_room_id
    and status in ('adjusting','final_reveal','reveal')
  order by created_at desc
  limit 1
  for update;

  if not found then return; end if;

  select count(*) into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count < 2 then
    update public.game_rounds set status = 'finished' where id = v_round.id;
    update public.rooms set status = 'waiting', next_round_at = null where id = p_room_id;
    update public.room_players set ready = false where room_id = p_room_id;
    return;
  end if;

  if v_round.status = 'adjusting' then
    select count(*) into v_ready_count
    from public.room_players
    where room_id = p_room_id
      and ready is true;

    if v_ready_count >= 2
       or (
         v_round.adjustment_ends_at is not null
         and now() >= v_round.adjustment_ends_at
       ) then
      update public.game_rounds set status = 'final_reveal' where id = v_round.id;
      update public.rooms set status = 'final_reveal' where id = p_room_id;
      update public.room_players set ready = false where room_id = p_room_id;
      v_round.status := 'final_reveal';
    end if;
  end if;

  if v_round.status in ('final_reveal','reveal') then
    select count(*) into v_ready_count
    from public.room_players
    where room_id = p_room_id
      and ready is true;

    if v_ready_count >= 2
       or (
         v_round.final_reveal_ends_at is not null
         and now() >= v_round.final_reveal_ends_at
       ) then
      update public.game_rounds set status = 'finished' where id = v_round.id;

      select user_id into v_head
      from public.room_players
      where room_id = p_room_id
      order by random()
      limit 1;

      select user_id into v_body
      from public.room_players
      where room_id = p_room_id
        and user_id <> v_head
      limit 1;

      set constraints room_players_room_id_role_key deferred;

      update public.room_players
      set role = case when user_id = v_head then 'HEAD' else 'BODY' end,
          ready = false
      where room_id = p_room_id;

      v_deadline := now() + interval '15 seconds';

      insert into public.game_rounds(
        room_id,
        status,
        started_at,
        ends_at,
        head_player_id,
        body_player_id,
        prompt_options,
        prompt_selection_ends_at
      )
      values (
        p_room_id,
        'prompt_select',
        now(),
        v_deadline,
        v_head,
        v_body,
        private.random_prompt_options(),
        v_deadline
      )
      returning * into v_new_round;

      update public.rooms
      set status = 'prompt_select',
          next_round_at = null
      where id = p_room_id;

      return next v_new_round;
    end if;
  end if;
end;
$function$;


-- Crocat 1.4.5: immediate phase transitions, direct room links, heartbeats and stale-room cleanup.

create extension if not exists pg_cron;

alter table public.room_players
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists room_players_last_seen_at_idx
  on public.room_players(last_seen_at);

create or replace function private.touch_room_presence_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players
  set last_seen_at = now()
  where room_id = p_room_id
    and user_id = v_user;

  if not found then
    raise exception 'You are not a member of this room';
  end if;
end;
$function$;

create or replace function public.touch_room_presence(p_room_id uuid)
returns void
language sql
security definer
set search_path = public, private, pg_temp
as $function$
  select private.touch_room_presence_impl(p_room_id);
$function$;

revoke all on function private.touch_room_presence_impl(uuid) from public;
revoke all on function public.touch_room_presence(uuid) from public, anon;
grant execute on function public.touch_room_presence(uuid) to authenticated;

create or replace function private.cleanup_stale_rooms_impl()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_deleted integer;
begin
  delete from public.rooms r
  where not exists (
    select 1
    from public.room_players rp
    where rp.room_id = r.id
      and rp.last_seen_at >= now() - interval '1 minute'
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function private.cleanup_stale_rooms_impl() from public;

create or replace function private.join_room_impl(
  p_code text,
  p_display_name text
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  p_code := upper(btrim(p_code));
  p_display_name := btrim(p_display_name);

  if char_length(p_display_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.code = p_code
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    update public.room_players
    set last_seen_at = now()
    where room_id = v_room.id
      and user_id = v_user;

    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'This room already started';
  end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then
    raise exception 'Room is full';
  end if;

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, p_display_name, 'BODY', now());

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$function$;

create or replace function private.join_or_create_room_impl(
  p_code text,
  p_host_display_name text,
  p_guest_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_host_name text := btrim(p_host_display_name);
  v_guest_name text := btrim(p_guest_display_name);
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
  v_room_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Room code must contain exactly 6 letters or numbers';
  end if;
  if char_length(v_host_name) not between 2 and 18
     or char_length(v_guest_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  p_round_seconds := greatest(10, least(coalesce(p_round_seconds, 180), 600));
  perform pg_advisory_xact_lock(hashtext(v_code)::bigint);

  select r.* into v_room
  from public.rooms r
  where r.code = v_code
  for update;

  if not found then
    insert into public.rooms(code, host_id, round_seconds)
    values (v_code, v_user, p_round_seconds)
    returning id into v_room_id;

    insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
    values (v_room_id, v_user, v_host_name, 'HEAD', now());

    return query select v_room_id, v_code, 'HEAD'::text;
    return;
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    update public.room_players
    set last_seen_at = now()
    where room_id = v_room.id
      and user_id = v_user;

    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, v_guest_name, 'BODY', now());

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$function$;

create or replace function private.submit_drawing_impl(
  p_round_id uuid,
  p_role text,
  p_drawing jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_expected_role text;
  v_submitted_count integer;
  v_phase_started_at timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'drawing' then raise exception 'Round is not accepting drawings'; end if;

  v_expected_role := case
    when v_round.head_player_id = v_user then 'HEAD'
    when v_round.body_player_id = v_user then 'BODY'
    else null
  end;

  if v_expected_role is null or v_expected_role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    raise exception 'Invalid drawing payload';
  end if;

  insert into public.submissions(
    round_id, player_id, role, drawing, transform, submitted
  )
  values (
    p_round_id,
    v_user,
    p_role,
    p_drawing,
    '{"x":0,"y":0,"scale":1}'::jsonb,
    true
  )
  on conflict (round_id, player_id)
  do update set
    drawing = excluded.drawing,
    transform = '{"x":0,"y":0,"scale":1}'::jsonb,
    submitted = true,
    created_at = now();

  select count(*) into v_submitted_count
  from public.submissions
  where round_id = p_round_id
    and submitted is true;

  if v_submitted_count >= 2 then
    v_phase_started_at := now();

    update public.game_rounds
    set status = 'adjusting',
        revealed_at = coalesce(revealed_at, v_phase_started_at),
        adjustment_ends_at = v_phase_started_at + interval '15 seconds',
        final_reveal_ends_at = v_phase_started_at + interval '30 seconds'
    where id = p_round_id
      and status = 'drawing';

    update public.rooms
    set status = 'adjusting',
        next_round_at = v_phase_started_at + interval '30 seconds'
    where id = v_round.room_id;

    update public.room_players
    set ready = false
    where room_id = v_round.room_id;
  end if;
end;
$function$;

create or replace function private.leave_room_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then return; end if;
  if not private.is_room_member(p_room_id) then return; end if;

  if v_room.host_id = v_user then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_user;

  if not exists (
    select 1 from public.room_players where room_id = p_room_id
  ) then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  update public.game_rounds
  set status = 'finished'
  where room_id = p_room_id
    and status in ('prompt_select','drawing','adjusting','final_reveal','reveal');

  update public.rooms
  set status = 'waiting',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$function$;

do $do$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname = 'crocat-clean-stale-rooms'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end
$do$;

select cron.schedule(
  'crocat-clean-stale-rooms',
  '* * * * *',
  $cron$select private.cleanup_stale_rooms_impl();$cron$
);


-- Crocat 1.4.5: keep the public heartbeat RPC invoker-safe while the checked implementation stays private.

create or replace function public.touch_room_presence(p_room_id uuid)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.touch_room_presence_impl(p_room_id);
$function$;

revoke all on function private.touch_room_presence_impl(uuid) from public, anon;
grant execute on function private.touch_room_presence_impl(uuid) to authenticated;

revoke all on function public.touch_room_presence(uuid) from public, anon;
grant execute on function public.touch_room_presence(uuid) to authenticated;


-- Crocat 1.4.5 hotfix: qualify room_players columns inside table-returning join functions.

create or replace function private.join_room_impl(
  p_code text,
  p_display_name text
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  p_code := upper(btrim(p_code));
  p_display_name := btrim(p_display_name);

  if char_length(p_display_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.code = p_code
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    update public.room_players rp
    set last_seen_at = now()
    where rp.room_id = v_room.id
      and rp.user_id = v_user;

    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'This room already started';
  end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then
    raise exception 'Room is full';
  end if;

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, p_display_name, 'BODY', now());

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$function$;

create or replace function private.join_or_create_room_impl(
  p_code text,
  p_host_display_name text,
  p_guest_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_host_name text := btrim(p_host_display_name);
  v_guest_name text := btrim(p_guest_display_name);
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
  v_room_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Room code must contain exactly 6 letters or numbers';
  end if;
  if char_length(v_host_name) not between 2 and 18
     or char_length(v_guest_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  p_round_seconds := greatest(10, least(coalesce(p_round_seconds, 180), 600));
  perform pg_advisory_xact_lock(hashtext(v_code)::bigint);

  select r.* into v_room
  from public.rooms r
  where r.code = v_code
  for update;

  if not found then
    insert into public.rooms(code, host_id, round_seconds)
    values (v_code, v_user, p_round_seconds)
    returning id into v_room_id;

    insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
    values (v_room_id, v_user, v_host_name, 'HEAD', now());

    return query select v_room_id, v_code, 'HEAD'::text;
    return;
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    update public.room_players rp
    set last_seen_at = now()
    where rp.room_id = v_room.id
      and rp.user_id = v_user;

    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, v_guest_name, 'BODY', now());

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$function$;


-- Crocat 1.4.6: curated aesthetic prompt catalog and semantic part labels.

alter table private.drawing_prompts
  add column if not exists head_label text,
  add column if not exists body_label text;

delete from private.drawing_prompts;

insert into private.drawing_prompts(theme, term, head_label, body_label)
values
('Mystisch', 'Wahrsagerkugel', 'Kugel', 'Ständer'),
('Mystisch', 'Schneekugel', 'Kugel', 'Sockel'),
('Mystisch', 'Zaubertrank', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Mondlaterne', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Kristalllampe', 'Kristall', 'Sockel'),
('Mystisch', 'Räucherschale', 'Rauch', 'Schale'),
('Mystisch', 'Magische Kerze', 'Flamme', 'Kerze'),
('Mystisch', 'Mystischer Spiegel', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Traumfänger', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Hexenkessel', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Sternenlaterne', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Zauberbuch auf Podest', 'Buch', 'Podest'),
('Fantasy', 'Fee', 'Kopf', 'Körper'),
('Fantasy', 'Hexe', 'Kopf', 'Körper'),
('Fantasy', 'Elfe', 'Kopf', 'Körper'),
('Fantasy', 'Zauberin', 'Kopf', 'Körper'),
('Fantasy', 'Sternenmagier', 'Kopf', 'Körper'),
('Fantasy', 'Mondprinzessin', 'Kopf', 'Körper'),
('Fantasy', 'Pilzgeist', 'Kopf', 'Körper'),
('Fantasy', 'Wolkenwesen', 'Kopf', 'Körper'),
('Fantasy', 'Meerjungfrau', 'Kopf', 'Körper'),
('Fantasy', 'Waldgeist', 'Kopf', 'Körper'),
('Fantasy', 'Drache', 'Kopf', 'Körper'),
('Fantasy', 'Phönix', 'Kopf', 'Körper'),
('Natur', 'Bonsai', 'Pflanze', 'Topf'),
('Natur', 'Kaktus im Topf', 'Pflanze', 'Topf'),
('Natur', 'Sonnenblume', 'Blüte', 'Stiel'),
('Natur', 'Lotusblume', 'Blüte', 'Stiel'),
('Natur', 'Pilz', 'Hut', 'Stiel'),
('Natur', 'Palme im Topf', 'Pflanze', 'Topf'),
('Natur', 'Rose in Vase', 'Blüte', 'Vase'),
('Natur', 'Lavendel im Topf', 'Pflanze', 'Topf'),
('Natur', 'Orchidee im Topf', 'Pflanze', 'Topf'),
('Natur', 'Monstera im Topf', 'Pflanze', 'Topf'),
('Natur', 'Farn im Topf', 'Pflanze', 'Topf'),
('Natur', 'Seerose', 'Blüte', 'Blatt'),
('Elegant', 'Parfümflakon', 'Verschluss', 'Flakon'),
('Elegant', 'Champagnerglas', 'Oberer Teil', 'Unterer Teil'),
('Elegant', 'Kerzenständer', 'Kerze', 'Ständer'),
('Elegant', 'Schmuckständer', 'Schmuck', 'Ständer'),
('Elegant', 'Dekorativer Spiegel', 'Oberer Teil', 'Unterer Teil'),
('Elegant', 'Elegante Lampe', 'Lampenschirm', 'Fuß'),
('Elegant', 'Vase', 'Oberer Teil', 'Unterer Teil'),
('Elegant', 'Statue auf Sockel', 'Statue', 'Sockel'),
('Elegant', 'Grammophon', 'Trichter', 'Gehäuse'),
('Elegant', 'Sanduhr', 'Oberer Teil', 'Unterer Teil'),
('Elegant', 'Pokal', 'Schale', 'Sockel'),
('Elegant', 'Schmuckschatulle', 'Deckel', 'Unterteil'),
('Genuss', 'Burger', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Sushi', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Cupcake', 'Topping', 'Förmchen'),
('Genuss', 'Eisbecher', 'Eis', 'Becher'),
('Genuss', 'Cocktail', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Macaron', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Donut', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Torte', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Pancake-Stapel', 'Topping', 'Stapel'),
('Genuss', 'Bubble Tea', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Ramen-Schale', 'Topping', 'Schale'),
('Genuss', 'Teetasse', 'Tasse', 'Untertasse');

alter table private.drawing_prompts
  alter column head_label set not null,
  alter column body_label set not null;

create or replace function private.random_prompt_options()
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $function$
  with chosen_themes as (
    select theme
    from private.drawing_prompts
    group by theme
    order by random()
    limit 3
  ),
  chosen as (
    select picked.theme, picked.term, picked.head_label, picked.body_label
    from chosen_themes ct
    cross join lateral (
      select dp.theme, dp.term, dp.head_label, dp.body_label
      from private.drawing_prompts dp
      where dp.theme = ct.theme
      order by random()
      limit 1
    ) picked
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'theme', theme,
        'term', term,
        'headLabel', head_label,
        'bodyLabel', body_label
      )
    ),
    '[]'::jsonb
  )
  from chosen;
$function$;

create or replace function private.reroll_prompt_impl(p_round_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_options jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'prompt_select' then raise exception 'Prompt selection is closed'; end if;
  if v_round.head_player_id <> v_user then raise exception 'Only the HEAD player can reroll prompts'; end if;
  if v_round.prompt_reroll_used then raise exception 'Prompt reroll already used'; end if;
  if now() > v_round.prompt_selection_ends_at then raise exception 'Prompt selection time expired'; end if;

  with old_terms as (
    select value->>'term' as term
    from jsonb_array_elements(v_round.prompt_options)
  ),
  chosen_themes as (
    select dp.theme
    from private.drawing_prompts dp
    where dp.term not in (select term from old_terms)
    group by dp.theme
    order by random()
    limit 3
  ),
  chosen as (
    select picked.theme, picked.term, picked.head_label, picked.body_label
    from chosen_themes ct
    cross join lateral (
      select dp.theme, dp.term, dp.head_label, dp.body_label
      from private.drawing_prompts dp
      where dp.theme = ct.theme
        and dp.term not in (select term from old_terms)
      order by random()
      limit 1
    ) picked
  )
  select jsonb_agg(
    jsonb_build_object(
      'theme', theme,
      'term', term,
      'headLabel', head_label,
      'bodyLabel', body_label
    )
  )
  into v_options
  from chosen;

  update public.game_rounds
  set prompt_options = v_options,
      prompt_reroll_used = true
  where id = p_round_id
  returning * into v_round;

  return next v_round;
end;
$function$;


-- Crocat 1.4.7: create phase deadlines when each phase actually starts.

create or replace function private.submit_drawing_impl(
  p_round_id uuid,
  p_role text,
  p_drawing jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_expected_role text;
  v_submitted_count integer;
  v_phase_started_at timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'drawing' then raise exception 'Round is not accepting drawings'; end if;

  v_expected_role := case
    when v_round.head_player_id = v_user then 'HEAD'
    when v_round.body_player_id = v_user then 'BODY'
    else null
  end;

  if v_expected_role is null or v_expected_role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    raise exception 'Invalid drawing payload';
  end if;

  insert into public.submissions(
    round_id, player_id, role, drawing, transform, submitted
  )
  values (
    p_round_id,
    v_user,
    p_role,
    p_drawing,
    '{"x":0,"y":0,"scale":1}'::jsonb,
    true
  )
  on conflict (round_id, player_id)
  do update set
    drawing = excluded.drawing,
    transform = '{"x":0,"y":0,"scale":1}'::jsonb,
    submitted = true,
    created_at = now();

  select count(*) into v_submitted_count
  from public.submissions
  where round_id = p_round_id
    and submitted is true;

  if v_submitted_count >= 2 then
    v_phase_started_at := now();

    update public.game_rounds
    set status = 'adjusting',
        revealed_at = coalesce(revealed_at, v_phase_started_at),
        adjustment_ends_at = v_phase_started_at + interval '15 seconds',
        final_reveal_ends_at = null
    where id = p_round_id
      and status = 'drawing';

    update public.rooms
    set status = 'adjusting',
        next_round_at = null
    where id = v_round.room_id;

    update public.room_players
    set ready = false
    where room_id = v_round.room_id;
  end if;
end;
$function$;

create or replace function private.advance_drawing_impl(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_count integer;
  v_phase_started_at timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if not private.is_room_member(v_round.room_id) then
    raise exception 'You are not a member of this room';
  end if;

  if v_round.status <> 'drawing' then return; end if;
  if now() < v_round.ends_at then return; end if;

  select count(*) into v_count
  from public.submissions
  where round_id = p_round_id;

  if v_count < 2 then return; end if;

  v_phase_started_at := now();

  update public.game_rounds
  set status = 'adjusting',
      revealed_at = coalesce(revealed_at, v_phase_started_at),
      adjustment_ends_at = v_phase_started_at + interval '15 seconds',
      final_reveal_ends_at = null
  where id = p_round_id;

  update public.rooms
  set status = 'adjusting',
      next_round_at = null
  where id = v_round.room_id;

  update public.room_players
  set ready = false
  where room_id = v_round.room_id;
end;
$function$;

create or replace function private.advance_phase_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_round public.game_rounds%rowtype;
  v_player_count integer;
  v_ready_count integer;
  v_head uuid;
  v_body uuid;
  v_new_round public.game_rounds%rowtype;
  v_deadline timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;

  select * into v_round
  from public.game_rounds
  where room_id = p_room_id
    and status in ('adjusting','final_reveal','reveal')
  order by created_at desc
  limit 1
  for update;

  if not found then return; end if;

  select count(*) into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count < 2 then
    update public.game_rounds set status = 'finished' where id = v_round.id;
    update public.rooms set status = 'waiting', next_round_at = null where id = p_room_id;
    update public.room_players set ready = false where room_id = p_room_id;
    return;
  end if;

  if v_round.status = 'adjusting' then
    select count(*) into v_ready_count
    from public.room_players
    where room_id = p_room_id
      and ready is true;

    if v_ready_count >= 2
       or (
         v_round.adjustment_ends_at is not null
         and now() >= v_round.adjustment_ends_at
       ) then
      v_deadline := now() + interval '15 seconds';

      update public.game_rounds
      set status = 'final_reveal',
          final_reveal_ends_at = v_deadline
      where id = v_round.id;

      update public.rooms
      set status = 'final_reveal',
          next_round_at = v_deadline
      where id = p_room_id;

      update public.room_players
      set ready = false
      where room_id = p_room_id;

      v_round.status := 'final_reveal';
      v_round.final_reveal_ends_at := v_deadline;
    end if;
  end if;

  if v_round.status in ('final_reveal','reveal') then
    if v_round.final_reveal_ends_at is null then
      v_deadline := now() + interval '15 seconds';

      update public.game_rounds
      set final_reveal_ends_at = v_deadline
      where id = v_round.id;

      update public.rooms
      set next_round_at = v_deadline
      where id = p_room_id;

      v_round.final_reveal_ends_at := v_deadline;
    end if;

    select count(*) into v_ready_count
    from public.room_players
    where room_id = p_room_id
      and ready is true;

    if v_ready_count >= 2
       or now() >= v_round.final_reveal_ends_at then
      update public.game_rounds set status = 'finished' where id = v_round.id;

      select user_id into v_head
      from public.room_players
      where room_id = p_room_id
      order by random()
      limit 1;

      select user_id into v_body
      from public.room_players
      where room_id = p_room_id
        and user_id <> v_head
      limit 1;

      set constraints room_players_room_id_role_key deferred;

      update public.room_players
      set role = case when user_id = v_head then 'HEAD' else 'BODY' end,
          ready = false
      where room_id = p_room_id;

      v_deadline := now() + interval '15 seconds';

      insert into public.game_rounds(
        room_id,
        status,
        started_at,
        ends_at,
        head_player_id,
        body_player_id,
        prompt_options,
        prompt_selection_ends_at
      )
      values (
        p_room_id,
        'prompt_select',
        now(),
        v_deadline,
        v_head,
        v_body,
        private.random_prompt_options(),
        v_deadline
      )
      returning * into v_new_round;

      update public.rooms
      set status = 'prompt_select',
          next_round_at = null
      where id = p_room_id;

      return next v_new_round;
    end if;
  end if;
end;
$function$;

-- Normalize any in-flight rooms when this migration is deployed.
update public.game_rounds
set final_reveal_ends_at = null
where status = 'adjusting';

update public.rooms
set next_round_at = null
where status = 'adjusting';

with active_reveal as (
  update public.game_rounds
  set final_reveal_ends_at = now() + interval '15 seconds'
  where status in ('final_reveal','reveal')
  returning room_id, final_reveal_ends_at
)
update public.rooms r
set next_round_at = ar.final_reveal_ends_at
from active_reveal ar
where r.id = ar.room_id;


-- Crocat 1.4.9 final state: equal lobby players.
-- host_id is retained only as a legacy room reference; it grants no permissions.
comment on column public.rooms.host_id is
  'Legacy room reference for compatibility; does not grant lobby privileges.';

create or replace function private.set_ready_impl(
  p_room_id uuid,
  p_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  update public.room_players rp
  set ready = coalesce(p_ready, false)
  from public.rooms r
  where rp.room_id = p_room_id
    and rp.user_id = v_user
    and r.id = rp.room_id
    and r.status in ('waiting','adjusting','final_reveal','reveal');

  if not found then
    raise exception 'Ready state is unavailable for this player in the current phase';
  end if;
end;
$function$;

create or replace function private.update_room_settings_impl(
  p_room_id uuid,
  p_round_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_seconds integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;
  if not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_user
  ) then
    raise exception 'You are not a member of this room';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'Room settings can only be changed while waiting';
  end if;

  v_seconds := greatest(10, least(coalesce(p_round_seconds, v_room.round_seconds), 600));

  update public.rooms
  set round_seconds = v_seconds
  where id = p_room_id;

  -- Settings affect both players, so both must confirm Ready again.
  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$function$;

create or replace function private.leave_room_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_remaining_user uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then return; end if;
  if not private.is_room_member(p_room_id) then return; end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_user;

  select rp.user_id into v_remaining_user
  from public.room_players rp
  where rp.room_id = p_room_id
  order by rp.joined_at
  limit 1;

  if v_remaining_user is null then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  update public.game_rounds
  set status = 'finished'
  where room_id = p_room_id
    and status in ('prompt_select','drawing','adjusting','final_reveal','reveal');

  update public.rooms
  set host_id = case when host_id = v_user then v_remaining_user else host_id end,
      status = 'waiting',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$function$;

create or replace function private.join_room_impl(
  p_code text,
  p_display_name text
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
  v_join_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  p_code := upper(btrim(p_code));
  p_display_name := btrim(p_display_name);

  if char_length(p_display_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.code = p_code
  for update;

  if not found then raise exception 'Room not found'; end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    update public.room_players rp
    set last_seen_at = now()
    where rp.room_id = v_room.id
      and rp.user_id = v_user;

    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  v_join_role := case
    when exists (
      select 1 from public.room_players rp
      where rp.room_id = v_room.id
        and rp.role = 'HEAD'
    ) then 'BODY'
    else 'HEAD'
  end;

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, p_display_name, v_join_role, now());

  return query select v_room.id, v_room.code, v_join_role;
end;
$function$;

create or replace function private.join_or_create_room_impl(
  p_code text,
  p_host_display_name text,
  p_guest_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_host_name text := btrim(p_host_display_name);
  v_guest_name text := btrim(p_guest_display_name);
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
  v_room_id uuid;
  v_join_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Room code must contain exactly 6 letters or numbers';
  end if;
  if char_length(v_host_name) not between 2 and 18
     or char_length(v_guest_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  p_round_seconds := greatest(10, least(coalesce(p_round_seconds, 180), 600));
  perform pg_advisory_xact_lock(hashtext(v_code)::bigint);

  select r.* into v_room
  from public.rooms r
  where r.code = v_code
  for update;

  if not found then
    insert into public.rooms(code, host_id, round_seconds)
    values (v_code, v_user, p_round_seconds)
    returning id into v_room_id;

    insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
    values (v_room_id, v_user, v_host_name, 'HEAD', now());

    return query select v_room_id, v_code, 'HEAD'::text;
    return;
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    update public.room_players rp
    set last_seen_at = now()
    where rp.room_id = v_room.id
      and rp.user_id = v_user;

    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  v_join_role := case
    when exists (
      select 1 from public.room_players rp
      where rp.room_id = v_room.id
        and rp.role = 'HEAD'
    ) then 'BODY'
    else 'HEAD'
  end;

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, v_guest_name, v_join_role, now());

  return query select v_room.id, v_room.code, v_join_role;
end;
$function$;

create or replace function private.start_round_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player_count integer;
  v_ready_count integer;
  v_head uuid;
  v_body uuid;
  v_round public.game_rounds%rowtype;
  v_deadline timestamptz := now() + interval '15 seconds';
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;
  if not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_user
  ) then
    raise exception 'You are not a member of this room';
  end if;
  if v_room.status <> 'waiting' then raise exception 'Room is not waiting'; end if;

  select count(*) into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count <> 2 then raise exception 'Two players are required'; end if;

  select count(*) into v_ready_count
  from public.room_players
  where room_id = p_room_id
    and ready is true;

  if v_ready_count <> 2 then
    raise exception 'Both players must be ready';
  end if;

  select user_id into v_head
  from public.room_players
  where room_id = p_room_id
  order by random()
  limit 1;

  select user_id into v_body
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_head
  limit 1;

  set constraints room_players_room_id_role_key deferred;

  update public.room_players
  set role = case when user_id = v_head then 'HEAD' else 'BODY' end,
      ready = false
  where room_id = p_room_id;

  insert into public.game_rounds(
    room_id, status, started_at, ends_at,
    head_player_id, body_player_id,
    prompt_options, prompt_selection_ends_at
  )
  values (
    p_room_id, 'prompt_select', now(), v_deadline,
    v_head, v_body,
    private.random_prompt_options(), v_deadline
  )
  returning * into v_round;

  update public.rooms
  set status = 'prompt_select',
      next_round_at = null
  where id = p_room_id;

  return next v_round;
end;
$function$;

-- Crocat 1.5.0: persistent player profiles, friendships, lobby invites and shared presence.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  friend_code text not null unique check (friend_code ~ '^[A-Z0-9]{8}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 18),
  color_key text not null default 'moss'
    check (color_key in ('moss','lime','coral','blue','violet','peach','mint')),
  avatar_key text not null default 'round'
    check (avatar_key in ('round','ears','spiky')),
  theme_key text not null default 'paper'
    check (theme_key in ('paper','ink')),
  symbol_key text not null default 'star'
    check (symbol_key in ('star','spark','heart','moon','bolt')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (user_a <> user_b),
  check (requested_by = user_a or requested_by = user_b),
  unique (user_a, user_b)
);

create table public.lobby_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  check (sender_id <> recipient_id)
);

create unique index lobby_invites_pending_pair_room_idx
  on public.lobby_invites(sender_id, recipient_id, room_id)
  where status = 'pending';

create index profiles_last_seen_idx
  on public.profiles(last_seen_at);

create index friendships_user_a_idx
  on public.friendships(user_a);

create index friendships_user_b_idx
  on public.friendships(user_b);

create index lobby_invites_recipient_status_idx
  on public.lobby_invites(recipient_id, status, created_at desc);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.lobby_invites enable row level security;

create policy profiles_visible_to_self_and_friends
on public.profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_a = (select auth.uid()) and f.user_b = profiles.user_id)
        or (f.user_b = (select auth.uid()) and f.user_a = profiles.user_id)
      )
  )
  or exists (
    select 1
    from public.room_players me
    join public.room_players them
      on them.room_id = me.room_id
    where me.user_id = (select auth.uid())
      and them.user_id = profiles.user_id
  )
);

create policy friendships_visible_to_members
on public.friendships
for select
to authenticated
using (
  user_a = (select auth.uid())
  or user_b = (select auth.uid())
);

create policy lobby_invites_visible_to_members
on public.lobby_invites
for select
to authenticated
using (
  sender_id = (select auth.uid())
  or recipient_id = (select auth.uid())
);

revoke all on table
  public.profiles,
  public.friendships,
  public.lobby_invites
from public, anon;

grant select on table
  public.profiles,
  public.friendships,
  public.lobby_invites
to authenticated;

create or replace function private.make_friend_code()
returns text
language sql
set search_path = pg_catalog
as $function$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$function$;

revoke all on function private.make_friend_code() from public;

create or replace function private.normalized_friend_pair(
  p_left uuid,
  p_right uuid,
  out user_a uuid,
  out user_b uuid
)
language plpgsql
immutable
set search_path = pg_catalog
as $function$
begin
  if p_left::text < p_right::text then
    user_a := p_left;
    user_b := p_right;
  else
    user_a := p_right;
    user_b := p_left;
  end if;
end;
$function$;

revoke all on function private.normalized_friend_pair(uuid,uuid) from public;

create or replace function private.ensure_profile_impl(
  p_default_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_code text;
  v_name text := btrim(coalesce(p_default_name, ''));
  v_try integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.user_id = v_user;

  if found then
    update public.profiles p
    set last_seen_at = now()
    where p.user_id = v_user
    returning p.* into v_profile;

    return v_profile;
  end if;

  loop
    v_try := v_try + 1;
    v_code := private.make_friend_code();

    exit when not exists (
      select 1 from public.profiles p where p.friend_code = v_code
    );

    if v_try >= 12 then
      raise exception 'Could not allocate a friend code';
    end if;
  end loop;

  if char_length(v_name) not between 2 and 18 then
    v_name := 'Crocat ' || right(v_code, 4);
  end if;

  insert into public.profiles(
    user_id,
    friend_code,
    display_name,
    color_key,
    avatar_key,
    theme_key,
    symbol_key
  )
  values (
    v_user,
    v_code,
    v_name,
    'moss',
    'round',
    'paper',
    'star'
  )
  returning * into v_profile;

  return v_profile;
end;
$function$;

revoke all on function private.ensure_profile_impl(text) from public;

create or replace function public.ensure_profile(
  p_default_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
begin
  return private.ensure_profile_impl(p_default_name);
end;
$function$;

revoke all on function public.ensure_profile(text) from public, anon;
grant execute on function public.ensure_profile(text) to authenticated;

create or replace function public.update_profile(
  p_display_name text,
  p_color_key text,
  p_avatar_key text,
  p_theme_key text,
  p_symbol_key text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if char_length(v_name) not between 2 and 18 then
    raise exception 'Name must be 2-18 characters';
  end if;

  if p_color_key not in ('moss','lime','coral','blue','violet','peach','mint') then
    raise exception 'Invalid profile color';
  end if;

  if p_avatar_key not in ('round','ears','spiky') then
    raise exception 'Invalid avatar';
  end if;

  if p_theme_key not in ('paper','ink') then
    raise exception 'Invalid profile theme';
  end if;

  if p_symbol_key not in ('star','spark','heart','moon','bolt') then
    raise exception 'Invalid profile symbol';
  end if;

  perform private.ensure_profile_impl(v_name);

  update public.profiles p
  set display_name = v_name,
      color_key = p_color_key,
      avatar_key = p_avatar_key,
      theme_key = p_theme_key,
      symbol_key = p_symbol_key,
      last_seen_at = now(),
      updated_at = now()
  where p.user_id = v_user
  returning p.* into v_profile;

  update public.room_players rp
  set display_name = v_name
  where rp.user_id = v_user;

  return v_profile;
end;
$function$;

revoke all on function public.update_profile(text,text,text,text,text) from public, anon;
grant execute on function public.update_profile(text,text,text,text,text) to authenticated;

create or replace function public.touch_profile_presence()
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  perform private.ensure_profile_impl(null);

  update public.profiles p
  set last_seen_at = now()
  where p.user_id = v_user;
end;
$function$;

revoke all on function public.touch_profile_presence() from public, anon;
grant execute on function public.touch_profile_presence() to authenticated;

create or replace function private.touch_room_presence_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_display_name text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players rp
  set last_seen_at = now()
  where rp.room_id = p_room_id
    and rp.user_id = v_user
  returning rp.display_name into v_display_name;

  if not found then
    raise exception 'You are not a member of this room';
  end if;

  perform private.ensure_profile_impl(v_display_name);

  update public.profiles p
  set last_seen_at = now()
  where p.user_id = v_user;
end;
$function$;

create or replace function private.are_friends(
  p_a uuid,
  p_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_a = p_a and f.user_b = p_b)
        or (f.user_a = p_b and f.user_b = p_a)
      )
  );
$function$;

revoke all on function private.are_friends(uuid,uuid) from public;

create or replace function public.send_friend_request(
  p_friend_code text
)
returns public.friendships
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_a uuid;
  v_b uuid;
  v_existing public.friendships%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  perform private.ensure_profile_impl(null);

  select p.user_id into v_target
  from public.profiles p
  where p.friend_code = upper(btrim(p_friend_code));

  if v_target is null then
    raise exception 'Friend code not found';
  end if;

  if v_target = v_user then
    raise exception 'You cannot add yourself';
  end if;

  select n.user_a, n.user_b
  into v_a, v_b
  from private.normalized_friend_pair(v_user, v_target) n;

  select f.* into v_existing
  from public.friendships f
  where f.user_a = v_a
    and f.user_b = v_b
  for update;

  if found then
    if v_existing.status = 'accepted' then
      return v_existing;
    end if;

    if v_existing.requested_by <> v_user then
      update public.friendships f
      set status = 'accepted',
          responded_at = now()
      where f.id = v_existing.id
      returning f.* into v_existing;
    end if;

    return v_existing;
  end if;

  insert into public.friendships(
    user_a,
    user_b,
    requested_by,
    status
  )
  values (
    v_a,
    v_b,
    v_user,
    'pending'
  )
  returning * into v_existing;

  return v_existing;
end;
$function$;

revoke all on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.respond_friend_request(
  p_friendship_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_row public.friendships%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select f.* into v_row
  from public.friendships f
  where f.id = p_friendship_id
  for update;

  if not found
     or v_row.status <> 'pending'
     or v_row.requested_by = v_user
     or not (v_row.user_a = v_user or v_row.user_b = v_user) then
    raise exception 'Friend request is unavailable';
  end if;

  if coalesce(p_accept, false) then
    update public.friendships f
    set status = 'accepted',
        responded_at = now()
    where f.id = p_friendship_id;
  else
    delete from public.friendships f
    where f.id = p_friendship_id;
  end if;
end;
$function$;

revoke all on function public.respond_friend_request(uuid,boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid,boolean) to authenticated;

create or replace function public.remove_friend(
  p_friend_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_friend_user_id is null or p_friend_user_id = v_user then
    raise exception 'Invalid friend';
  end if;

  select n.user_a, n.user_b
  into v_a, v_b
  from private.normalized_friend_pair(v_user, p_friend_user_id) n;

  delete from public.friendships f
  where f.user_a = v_a
    and f.user_b = v_b;

  update public.lobby_invites i
  set status = 'declined',
      responded_at = now()
  where i.status = 'pending'
    and (
      (i.sender_id = v_user and i.recipient_id = p_friend_user_id)
      or (i.sender_id = p_friend_user_id and i.recipient_id = v_user)
    );
end;
$function$;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

create or replace function public.list_friends()
returns table(
  friend_user_id uuid,
  display_name text,
  friend_code text,
  color_key text,
  avatar_key text,
  theme_key text,
  symbol_key text,
  last_seen_at timestamptz,
  online boolean,
  open_room_code text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  return query
  with accepted as (
    select
      case
        when f.user_a = v_user then f.user_b
        else f.user_a
      end as friend_id
    from public.friendships f
    where f.status = 'accepted'
      and (f.user_a = v_user or f.user_b = v_user)
  ),
  activity as (
    select
      rp.user_id,
      max(rp.last_seen_at) as room_last_seen
    from public.room_players rp
    group by rp.user_id
  )
  select
    p.user_id,
    p.display_name,
    p.friend_code,
    p.color_key,
    p.avatar_key,
    p.theme_key,
    p.symbol_key,
    greatest(
      p.last_seen_at,
      coalesce(a.room_last_seen, p.last_seen_at)
    ),
    greatest(
      p.last_seen_at,
      coalesce(a.room_last_seen, p.last_seen_at)
    ) >= now() - interval '45 seconds',
    (
      select r.code
      from public.rooms r
      join public.room_players rp2
        on rp2.room_id = r.id
      where rp2.user_id = p.user_id
        and r.status = 'waiting'
        and (
          select count(*)
          from public.room_players x
          where x.room_id = r.id
        ) < 2
      order by r.created_at desc
      limit 1
    )
  from accepted af
  join public.profiles p
    on p.user_id = af.friend_id
  left join activity a
    on a.user_id = p.user_id
  order by p.display_name, p.user_id;
end;
$function$;

revoke all on function public.list_friends() from public, anon;
grant execute on function public.list_friends() to authenticated;

create or replace function public.list_friend_requests()
returns table(
  friendship_id uuid,
  other_user_id uuid,
  direction text,
  display_name text,
  friend_code text,
  color_key text,
  avatar_key text,
  theme_key text,
  symbol_key text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    f.id,
    p.user_id,
    case
      when f.requested_by = v_user then 'outgoing'
      else 'incoming'
    end,
    p.display_name,
    p.friend_code,
    p.color_key,
    p.avatar_key,
    p.theme_key,
    p.symbol_key,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.user_id = case
      when f.user_a = v_user then f.user_b
      else f.user_a
    end
  where f.status = 'pending'
    and (f.user_a = v_user or f.user_b = v_user)
  order by f.created_at desc;
end;
$function$;

revoke all on function public.list_friend_requests() from public, anon;
grant execute on function public.list_friend_requests() to authenticated;

create or replace function public.invite_friend(
  p_friend_user_id uuid,
  p_room_id uuid default null
)
returns table(
  invite_id uuid,
  room_id uuid,
  room_code text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_room public.rooms%rowtype;
  v_ticket record;
  v_invite public.lobby_invites%rowtype;
  v_existing_room_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not private.are_friends(v_user, p_friend_user_id) then
    raise exception 'You can only invite friends';
  end if;

  v_profile := private.ensure_profile_impl(null);

  if p_room_id is not null then
    select r.* into v_room
    from public.rooms r
    where r.id = p_room_id
    for update;

    if not found
       or v_room.status <> 'waiting'
       or not private.is_room_member(v_room.id)
       or (
         select count(*)
         from public.room_players rp
         where rp.room_id = v_room.id
       ) >= 2 then
      raise exception 'This lobby is not open';
    end if;
  else
    select r.id into v_existing_room_id
    from public.rooms r
    join public.room_players rp
      on rp.room_id = r.id
    where rp.user_id = v_user
      and r.status = 'waiting'
      and (
        select count(*)
        from public.room_players x
        where x.room_id = r.id
      ) < 2
    order by r.created_at desc
    limit 1;

    if v_existing_room_id is not null then
      select r.* into v_room
      from public.rooms r
      where r.id = v_existing_room_id
      for update;
    else
      select *
      into v_ticket
      from private.create_room_impl(v_profile.display_name, 180)
      limit 1;

      select r.* into v_room
      from public.rooms r
      where r.id = v_ticket.room_id;
    end if;
  end if;

  if exists (
    select 1
    from public.room_players rp
    where rp.room_id = v_room.id
      and rp.user_id = p_friend_user_id
  ) then
    raise exception 'Friend is already in this lobby';
  end if;

  update public.lobby_invites i
  set status = 'declined',
      responded_at = now()
  where i.sender_id = v_user
    and i.recipient_id = p_friend_user_id
    and i.status = 'pending';

  insert into public.lobby_invites(
    sender_id,
    recipient_id,
    room_id,
    status
  )
  values (
    v_user,
    p_friend_user_id,
    v_room.id,
    'pending'
  )
  returning * into v_invite;

  return query
  select v_invite.id, v_room.id, v_room.code;
end;
$function$;

revoke all on function public.invite_friend(uuid,uuid) from public, anon;
grant execute on function public.invite_friend(uuid,uuid) to authenticated;

create or replace function public.list_lobby_invites()
returns table(
  invite_id uuid,
  sender_user_id uuid,
  room_id uuid,
  room_code text,
  display_name text,
  color_key text,
  avatar_key text,
  theme_key text,
  symbol_key text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    i.id,
    i.sender_id,
    i.room_id,
    r.code,
    p.display_name,
    p.color_key,
    p.avatar_key,
    p.theme_key,
    p.symbol_key,
    i.created_at,
    i.expires_at
  from public.lobby_invites i
  join public.rooms r
    on r.id = i.room_id
  join public.profiles p
    on p.user_id = i.sender_id
  where i.recipient_id = v_user
    and i.status = 'pending'
    and i.expires_at > now()
    and r.status = 'waiting'
    and (
      select count(*)
      from public.room_players rp
      where rp.room_id = r.id
    ) < 2
  order by i.created_at desc;
end;
$function$;

revoke all on function public.list_lobby_invites() from public, anon;
grant execute on function public.list_lobby_invites() to authenticated;

create or replace function public.accept_lobby_invite(
  p_invite_id uuid
)
returns table(
  room_id uuid,
  room_code text,
  player_role text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_invite public.lobby_invites%rowtype;
  v_room public.rooms%rowtype;
  v_profile public.profiles%rowtype;
  v_ticket record;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select i.* into v_invite
  from public.lobby_invites i
  where i.id = p_invite_id
  for update;

  if not found
     or v_invite.recipient_id <> v_user
     or v_invite.status <> 'pending'
     or v_invite.expires_at <= now() then
    raise exception 'Invite is unavailable';
  end if;

  if not private.are_friends(v_user, v_invite.sender_id) then
    raise exception 'Invite is no longer valid';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = v_invite.room_id
  for update;

  if not found
     or v_room.status <> 'waiting'
     or (
       select count(*)
       from public.room_players rp
       where rp.room_id = v_room.id
     ) >= 2 then
    raise exception 'Lobby is no longer open';
  end if;

  v_profile := private.ensure_profile_impl(null);

  select *
  into v_ticket
  from private.join_room_impl(v_room.code, v_profile.display_name)
  limit 1;

  update public.lobby_invites i
  set status = 'accepted',
      responded_at = now()
  where i.id = v_invite.id;

  update public.lobby_invites i
  set status = 'declined',
      responded_at = now()
  where i.recipient_id = v_user
    and i.status = 'pending'
    and i.id <> v_invite.id;

  return query
  select
    v_ticket.room_id,
    v_ticket.room_code,
    v_ticket.player_role;
end;
$function$;

revoke all on function public.accept_lobby_invite(uuid) from public, anon;
grant execute on function public.accept_lobby_invite(uuid) to authenticated;

create or replace function public.decline_lobby_invite(
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.lobby_invites i
  set status = 'declined',
      responded_at = now()
  where i.id = p_invite_id
    and i.recipient_id = v_user
    and i.status = 'pending';

  if not found then
    raise exception 'Invite is unavailable';
  end if;
end;
$function$;

revoke all on function public.decline_lobby_invite(uuid) from public, anon;
grant execute on function public.decline_lobby_invite(uuid) to authenticated;

alter publication supabase_realtime
  add table public.profiles, public.friendships, public.lobby_invites;

-- Crocat 1.5.0: persistent private artwork gallery.

create table public.saved_artworks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_user_id uuid references auth.users(id) on delete set null,
  round_id uuid references public.game_rounds(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 60),
  prompt_term text,
  prompt_theme text,
  head_drawing jsonb not null,
  body_drawing jsonb not null,
  head_transform jsonb not null default '{"x":0,"y":0,"scale":1}'::jsonb,
  body_transform jsonb not null default '{"x":0,"y":0,"scale":1}'::jsonb,
  head_profile jsonb not null,
  body_profile jsonb not null,
  favorite boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index saved_artworks_owner_round_idx
  on public.saved_artworks(owner_id, round_id)
  where round_id is not null;

create index saved_artworks_owner_created_idx
  on public.saved_artworks(owner_id, created_at desc);

alter table public.saved_artworks enable row level security;

create policy saved_artworks_owner_select
on public.saved_artworks
for select
to authenticated
using (owner_id = (select auth.uid()));

revoke all on table public.saved_artworks from public, anon;
grant select on table public.saved_artworks to authenticated;

create or replace function private.profile_snapshot(
  p_user uuid,
  p_fallback_name text
)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select jsonb_build_object(
    'userId', p_user,
    'displayName', coalesce(p.display_name, p_fallback_name, 'Crocat'),
    'colorKey', coalesce(p.color_key, 'moss'),
    'avatarKey', coalesce(p.avatar_key, 'round'),
    'themeKey', coalesce(p.theme_key, 'paper'),
    'symbolKey', coalesce(p.symbol_key, 'star')
  )
  from (select 1) x
  left join public.profiles p
    on p.user_id = p_user;
$function$;

revoke all on function private.profile_snapshot(uuid,text) from public;

create or replace function private.generated_artwork_title(
  p_term text,
  p_round_id uuid,
  p_owner uuid
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_words text[] := array[
    'Coole',
    'Wilde',
    'Magische',
    'Freche',
    'Flauschige',
    'Glitzernde',
    'Seltsame'
  ];
  v_hash bigint := hashtext(p_round_id::text || p_owner::text)::bigint + 2147483648;
  v_word text;
  v_number integer;
  v_term text := btrim(coalesce(p_term, ''));
begin
  v_word := v_words[
    1 + mod(v_hash, array_length(v_words, 1))::integer
  ];

  v_number := 1 + mod(v_hash / 7, 99)::integer;

  if v_term = '' then
    v_term := 'Crocat';
  end if;

  return left(
    v_word || ' ' || initcap(v_term) || ' ' || v_number::text,
    60
  );
end;
$function$;

revoke all on function private.generated_artwork_title(text,uuid,uuid) from public;

create or replace function public.save_artwork(
  p_round_id uuid
)
returns public.saved_artworks
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_head public.submissions%rowtype;
  v_body public.submissions%rowtype;
  v_existing public.saved_artworks%rowtype;
  v_partner uuid;
  v_head_name text;
  v_body_name text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select a.* into v_existing
  from public.saved_artworks a
  where a.owner_id = v_user
    and a.round_id = p_round_id
  for update;

  if found then
    update public.saved_artworks a
    set favorite = true,
        updated_at = now()
    where a.id = v_existing.id
    returning a.* into v_existing;

    return v_existing;
  end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.id = p_round_id;

  if not found then
    raise exception 'Round not found';
  end if;

  if v_user <> v_round.head_player_id
     and v_user <> v_round.body_player_id then
    raise exception 'You did not participate in this artwork';
  end if;

  if v_round.status not in ('final_reveal', 'reveal', 'finished') then
    raise exception 'Artwork is not ready to save';
  end if;

  select s.* into v_head
  from public.submissions s
  where s.round_id = p_round_id
    and s.role = 'HEAD'
    and s.submitted is true
  order by s.created_at desc
  limit 1;

  select s.* into v_body
  from public.submissions s
  where s.round_id = p_round_id
    and s.role = 'BODY'
    and s.submitted is true
  order by s.created_at desc
  limit 1;

  if v_head.id is null or v_body.id is null then
    raise exception 'Artwork is incomplete';
  end if;

  v_partner := case
    when v_user = v_round.head_player_id
      then v_round.body_player_id
    else v_round.head_player_id
  end;

  select rp.display_name into v_head_name
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_round.head_player_id;

  select rp.display_name into v_body_name
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_round.body_player_id;

  insert into public.saved_artworks(
    owner_id,
    partner_user_id,
    round_id,
    title,
    prompt_term,
    prompt_theme,
    head_drawing,
    body_drawing,
    head_transform,
    body_transform,
    head_profile,
    body_profile,
    favorite
  )
  values (
    v_user,
    v_partner,
    p_round_id,
    private.generated_artwork_title(
      v_round.prompt_term,
      p_round_id,
      v_user
    ),
    v_round.prompt_term,
    v_round.prompt_theme,
    v_head.drawing,
    v_body.drawing,
    v_head.transform,
    v_body.transform,
    private.profile_snapshot(
      v_round.head_player_id,
      v_head_name
    ),
    private.profile_snapshot(
      v_round.body_player_id,
      v_body_name
    ),
    true
  )
  returning * into v_existing;

  return v_existing;
end;
$function$;

revoke all on function public.save_artwork(uuid) from public, anon;
grant execute on function public.save_artwork(uuid) to authenticated;

create or replace function public.rename_artwork(
  p_artwork_id uuid,
  p_title text
)
returns public.saved_artworks
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_row public.saved_artworks%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if char_length(v_title) not between 2 and 60 then
    raise exception 'Title must be 2-60 characters';
  end if;

  update public.saved_artworks a
  set title = v_title,
      updated_at = now()
  where a.id = p_artwork_id
    and a.owner_id = v_user
  returning a.* into v_row;

  if not found then
    raise exception 'Artwork not found';
  end if;

  return v_row;
end;
$function$;

revoke all on function public.rename_artwork(uuid,text) from public, anon;
grant execute on function public.rename_artwork(uuid,text) to authenticated;

create or replace function public.set_artwork_favorite(
  p_artwork_id uuid,
  p_favorite boolean
)
returns public.saved_artworks
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_row public.saved_artworks%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.saved_artworks a
  set favorite = coalesce(p_favorite, false),
      updated_at = now()
  where a.id = p_artwork_id
    and a.owner_id = v_user
  returning a.* into v_row;

  if not found then
    raise exception 'Artwork not found';
  end if;

  return v_row;
end;
$function$;

revoke all on function public.set_artwork_favorite(uuid,boolean) from public, anon;
grant execute on function public.set_artwork_favorite(uuid,boolean) to authenticated;

create or replace function public.delete_artwork(
  p_artwork_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  delete from public.saved_artworks a
  where a.id = p_artwork_id
    and a.owner_id = v_user;

  if not found then
    raise exception 'Artwork not found';
  end if;
end;
$function$;

revoke all on function public.delete_artwork(uuid) from public, anon;
grant execute on function public.delete_artwork(uuid) to authenticated;

-- Crocat 1.5.0: cover newly introduced foreign-key access paths.

create index friendships_requested_by_idx
  on public.friendships(requested_by);

create index lobby_invites_room_id_idx
  on public.lobby_invites(room_id);

create index saved_artworks_partner_user_id_idx
  on public.saved_artworks(partner_user_id);

create index saved_artworks_round_id_idx
  on public.saved_artworks(round_id);

-- Crocat 1.5.1: expose authoritative server time for synchronized online countdowns.

create or replace function public.server_clock_ms()
returns bigint
language sql
volatile
security invoker
set search_path = pg_catalog
as $function$
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
$function$;

revoke all on function public.server_clock_ms() from public, anon;
grant execute on function public.server_clock_ms() to authenticated;
