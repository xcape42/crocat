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
