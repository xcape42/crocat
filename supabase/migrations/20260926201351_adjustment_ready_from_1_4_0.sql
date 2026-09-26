-- Crocat 1.4.0 baseline: allow Ready during Adjustment and finish early at 2/2 Ready.

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
