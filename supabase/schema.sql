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

