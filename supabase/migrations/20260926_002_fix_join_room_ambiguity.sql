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

revoke all on function private.join_room_impl(text, text) from public;
grant execute on function private.join_room_impl(text, text) to authenticated;
