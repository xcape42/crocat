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