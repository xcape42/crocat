create or replace function private.kick_room_player_impl(
  p_room_id uuid,
  p_target_user_id uuid
)
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

  if p_target_user_id is null then
    raise exception 'Player is required';
  end if;

  if p_target_user_id = v_user then
    raise exception 'Use leave room to remove yourself';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  if not private.is_room_member(p_room_id) then
    raise exception 'Room membership required';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Players can only be removed while the room is waiting';
  end if;

  if not exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = p_target_user_id
  ) then
    raise exception 'Player is no longer in this room';
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = p_target_user_id;

  update public.rooms
  set host_id = case
        when host_id = p_target_user_id then v_user
        else host_id
      end,
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$$;

revoke all on function private.kick_room_player_impl(uuid, uuid) from public, anon;
grant execute on function private.kick_room_player_impl(uuid, uuid) to authenticated;

create or replace function public.kick_room_player(
  p_room_id uuid,
  p_target_user_id uuid
)
returns void
language sql
set search_path = public, private, pg_temp
as $$
  select private.kick_room_player_impl(p_room_id, p_target_user_id);
$$;

revoke all on function public.kick_room_player(uuid, uuid) from public, anon;
grant execute on function public.kick_room_player(uuid, uuid) to authenticated, service_role;
