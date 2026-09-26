-- Crocat 1.1.0 online multiplayer
-- Apply this migration after enabling Anonymous Sign-Ins in Supabase Auth.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (char_length(code) = 6),
  host_id uuid not null references auth.users(id) on delete cascade,
  game_mode text not null default 'split',
  status text not null default 'waiting' check (status in ('waiting','drawing','reveal','finished')),
  round_seconds integer not null default 180 check (round_seconds between 10 and 600),
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
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
  ends_at timestamptz not null
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

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_rounds enable row level security;
alter table public.submissions enable row level security;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "members can read rooms" on public.rooms;
create policy "members can read rooms"
on public.rooms for select
to authenticated
using (public.is_room_member(id));

drop policy if exists "members can read room players" on public.room_players;
create policy "members can read room players"
on public.room_players for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "members can read rounds" on public.game_rounds;
create policy "members can read rounds"
on public.game_rounds for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "members can read submissions" on public.submissions;
create policy "members can read submissions"
on public.submissions for select
to authenticated
using (
  exists (
    select 1
    from public.game_rounds gr
    where gr.id = submissions.round_id
      and public.is_room_member(gr.room_id)
  )
);

create or replace function public._crocat_code()
returns text
language sql
volatile
as $$
  select upper(substr(md5(gen_random_uuid()::text), 1, 6));
$$;

create or replace function public.create_room(
  p_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms;
  v_try integer := 0;
  v_name text := left(trim(coalesce(p_display_name, '')), 24);
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if char_length(v_name) < 1 then
    raise exception 'Display name required';
  end if;

  loop
    v_try := v_try + 1;
    begin
      insert into public.rooms(code, host_id, round_seconds)
      values (public._crocat_code(), v_uid, greatest(10, least(coalesce(p_round_seconds, 180), 600)))
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_try >= 8 then raise; end if;
    end;
  end loop;

  insert into public.room_players(room_id, user_id, display_name, role)
  values (v_room.id, v_uid, v_name, 'HEAD');

  return query select v_room.id, v_room.code, 'HEAD'::text;
end;
$$;

create or replace function public.join_room(
  p_code text,
  p_display_name text
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms;
  v_existing public.room_players;
  v_name text := left(trim(coalesce(p_display_name, '')), 24);
  v_count integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if char_length(v_name) < 1 then raise exception 'Display name required'; end if;

  select *
  into v_room
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then raise exception 'Room not found'; end if;
  if v_room.status <> 'waiting' then raise exception 'Round already started'; end if;

  select * into v_existing
  from public.room_players
  where room_id = v_room.id and user_id = v_uid;

  if found then
    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  select count(*) into v_count
  from public.room_players
  where room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  insert into public.room_players(room_id, user_id, display_name, role)
  values (v_room.id, v_uid, v_name, 'BODY');

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$$;

create or replace function public.set_ready(
  p_room_id uuid,
  p_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.room_players
  set ready = p_ready
  where room_id = p_room_id
    and user_id = auth.uid();

  if not found then raise exception 'Not a room member'; end if;
end;
$$;

create or replace function public.start_round(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_count integer;
  v_ready integer;
  v_round public.game_rounds;
begin
  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'Only the host can start'; end if;
  if v_room.status <> 'waiting' then raise exception 'Room is not waiting'; end if;

  select count(*), count(*) filter (where ready)
  into v_count, v_ready
  from public.room_players
  where room_id = p_room_id;

  if v_count <> 2 or v_ready <> 2 then
    raise exception 'Both players must be ready';
  end if;

  insert into public.game_rounds(room_id, status, started_at, ends_at)
  values (p_room_id, 'drawing', now(), now() + make_interval(secs => v_room.round_seconds))
  returning * into v_round;

  update public.rooms set status = 'drawing' where id = p_room_id;

  return next v_round;
end;
$$;

create or replace function public.submit_drawing(
  p_round_id uuid,
  p_role text,
  p_drawing jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.game_rounds;
  v_role text;
  v_count integer;
begin
  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;

  select role into v_role
  from public.room_players
  where room_id = v_round.room_id
    and user_id = auth.uid();

  if v_role is null then raise exception 'Not a room member'; end if;
  if v_role <> p_role then raise exception 'Role mismatch'; end if;

  insert into public.submissions(round_id, player_id, role, drawing)
  values (p_round_id, auth.uid(), p_role, p_drawing)
  on conflict (round_id, player_id)
  do update set drawing = excluded.drawing, role = excluded.role, created_at = now();

  select count(*) into v_count
  from public.submissions
  where round_id = p_round_id;

  if v_count >= 2 then
    update public.game_rounds set status = 'reveal' where id = p_round_id;
    update public.rooms set status = 'reveal' where id = v_round.room_id;
  end if;
end;
$$;

revoke all on function public.create_room(text, integer) from public;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.set_ready(uuid, boolean) from public;
revoke all on function public.start_round(uuid) from public;
revoke all on function public.submit_drawing(uuid, text, jsonb) from public;

grant execute on function public.create_room(text, integer) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
grant execute on function public.start_round(uuid) to authenticated;
grant execute on function public.submit_drawing(uuid, text, jsonb) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.room_players;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.game_rounds;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.submissions;
exception when duplicate_object then null; end $$;
