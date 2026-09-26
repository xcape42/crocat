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
