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
