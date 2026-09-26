-- Crocat 1.4.9 phase 2: remove the temporary 1.4.8 start compatibility.
-- From this point onward every waiting-room start requires exactly two Ready players.

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
