-- Crocat 1.7.3: start each online phase timer only after both players entered it.
-- New clients opt in per room; legacy/mixed clients keep the previous immediate-timer behavior.

alter table public.room_players
  add column if not exists phase_timer_sync_enabled boolean not null default false,
  add column if not exists phase_round_id uuid,
  add column if not exists phase_name text;

alter table public.game_rounds
  add column if not exists phase_timer_started_at timestamptz;

update public.game_rounds
set phase_timer_started_at = coalesce(phase_timer_started_at, now())
where status in ('prompt_select','drawing','adjusting','final_reveal','reveal');

alter table public.room_players
  drop constraint if exists room_players_phase_name_check;

alter table public.room_players
  add constraint room_players_phase_name_check
  check (
    phase_name is null
    or phase_name in ('prompt_select','drawing','adjusting','final_reveal')
  );

create or replace function private.phase_timer_sync_enabled_impl(
  p_room_id uuid
)
returns boolean
language sql
stable
set search_path = public, private, pg_temp
as $function$
  select
    count(*) = 2
    and coalesce(bool_and(rp.phase_timer_sync_enabled), false)
  from public.room_players rp
  where rp.room_id = p_room_id;
$function$;

revoke all on function private.phase_timer_sync_enabled_impl(uuid) from public, anon;
grant execute on function private.phase_timer_sync_enabled_impl(uuid) to authenticated, service_role;

create or replace function private.enable_phase_timer_sync_impl(
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players
  set phase_timer_sync_enabled = true
  where room_id = p_room_id
    and user_id = v_user;

  if not found then
    raise exception 'Room membership required';
  end if;
end;
$function$;

revoke all on function private.enable_phase_timer_sync_impl(uuid) from public, anon;
grant execute on function private.enable_phase_timer_sync_impl(uuid) to authenticated, service_role;

create or replace function public.enable_phase_timer_sync(
  p_room_id uuid
)
returns void
language sql
set search_path = public, private, pg_temp
as $function$
  select private.enable_phase_timer_sync_impl(p_room_id);
$function$;

revoke all on function public.enable_phase_timer_sync(uuid) from public, anon;
grant execute on function public.enable_phase_timer_sync(uuid) to authenticated, service_role;

create or replace function private.enter_phase_impl(
  p_round_id uuid,
  p_phase text
)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_room public.rooms%rowtype;
  v_arrived integer;
  v_started_at timestamptz;
  v_deadline timestamptz;
  v_expected_phase text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then
    raise exception 'Round not found';
  end if;

  if not private.is_room_member(v_round.room_id) then
    raise exception 'You are not a member of this room';
  end if;

  v_expected_phase := case
    when v_round.status = 'reveal' then 'final_reveal'
    else v_round.status
  end;

  if p_phase not in ('prompt_select','drawing','adjusting','final_reveal')
     or p_phase <> v_expected_phase then
    return next v_round;
    return;
  end if;

  update public.room_players
  set phase_round_id = p_round_id,
      phase_name = p_phase
  where room_id = v_round.room_id
    and user_id = v_user;

  select count(*)
  into v_arrived
  from public.room_players
  where room_id = v_round.room_id
    and phase_round_id = p_round_id
    and phase_name = p_phase;

  if v_round.phase_timer_started_at is not null
     or not private.phase_timer_sync_enabled_impl(v_round.room_id)
     or v_arrived < 2 then
    return next v_round;
    return;
  end if;

  select *
  into v_room
  from public.rooms
  where id = v_round.room_id
  for update;

  v_started_at := now();

  if p_phase = 'prompt_select' then
    v_deadline := v_started_at + interval '15 seconds';

    update public.game_rounds
    set phase_timer_started_at = v_started_at,
        prompt_selection_ends_at = v_deadline
    where id = p_round_id
    returning * into v_round;

  elsif p_phase = 'drawing' then
    v_deadline := v_started_at + make_interval(secs => v_room.round_seconds);

    update public.game_rounds
    set phase_timer_started_at = v_started_at,
        ends_at = v_deadline
    where id = p_round_id
    returning * into v_round;

  elsif p_phase = 'adjusting' then
    v_deadline := v_started_at + interval '15 seconds';

    update public.game_rounds
    set phase_timer_started_at = v_started_at,
        adjustment_ends_at = v_deadline
    where id = p_round_id
    returning * into v_round;

  else
    v_deadline := v_started_at + interval '15 seconds';

    update public.game_rounds
    set phase_timer_started_at = v_started_at,
        final_reveal_ends_at = v_deadline
    where id = p_round_id
    returning * into v_round;

    update public.rooms
    set next_round_at = v_deadline
    where id = v_round.room_id;
  end if;

  return next v_round;
end;
$function$;

revoke all on function private.enter_phase_impl(uuid, text) from public, anon;
grant execute on function private.enter_phase_impl(uuid, text) to authenticated, service_role;

create or replace function public.enter_phase(
  p_round_id uuid,
  p_phase text
)
returns setof public.game_rounds
language sql
set search_path = public, private, pg_temp
as $function$
  select * from private.enter_phase_impl(p_round_id, p_phase);
$function$;

revoke all on function public.enter_phase(uuid, text) from public, anon;
grant execute on function public.enter_phase(uuid, text) to authenticated, service_role;

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
  v_sync_timers boolean;
  v_phase_started_at timestamptz;
  v_deadline timestamptz;
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

  v_sync_timers := private.phase_timer_sync_enabled_impl(p_room_id);
  v_phase_started_at := case when v_sync_timers then null else now() end;
  v_deadline := case
    when v_sync_timers then now() + interval '1 day'
    else now() + interval '15 seconds'
  end;

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
      ready = false,
      phase_round_id = null,
      phase_name = null
  where room_id = p_room_id;

  insert into public.game_rounds(
    room_id, status, started_at, ends_at,
    head_player_id, body_player_id,
    prompt_options, prompt_selection_ends_at,
    phase_timer_started_at
  )
  values (
    p_room_id, 'prompt_select', now(), v_deadline,
    v_head, v_body,
    private.random_prompt_options(), v_deadline,
    v_phase_started_at
  )
  returning * into v_round;

  update public.rooms
  set status = 'prompt_select',
      next_round_at = null
  where id = p_room_id;

  return next v_round;
end;
$function$;

create or replace function private.select_prompt_impl(
  p_round_id uuid,
  p_term text
)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_room public.rooms%rowtype;
  v_option jsonb;
  v_sync_timers boolean;
  v_phase_started_at timestamptz;
  v_deadline timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'prompt_select' then raise exception 'Prompt selection is closed'; end if;
  if v_round.head_player_id <> v_user then raise exception 'Only the HEAD player can choose the prompt'; end if;
  if now() > v_round.prompt_selection_ends_at then raise exception 'Prompt selection time expired'; end if;

  select value into v_option
  from jsonb_array_elements(v_round.prompt_options)
  where value->>'term' = p_term
  limit 1;

  if v_option is null then raise exception 'Prompt is not one of the current options'; end if;

  select * into v_room
  from public.rooms
  where id = v_round.room_id
  for update;

  v_sync_timers := private.phase_timer_sync_enabled_impl(v_round.room_id);
  v_phase_started_at := case when v_sync_timers then null else now() end;
  v_deadline := case
    when v_sync_timers then now() + interval '1 day'
    else now() + make_interval(secs => v_room.round_seconds)
  end;

  update public.game_rounds
  set prompt_term = v_option->>'term',
      prompt_theme = v_option->>'theme',
      status = 'drawing',
      started_at = now(),
      ends_at = v_deadline,
      phase_timer_started_at = v_phase_started_at
  where id = p_round_id
  returning * into v_round;

  update public.rooms
  set status = 'drawing'
  where id = v_round.room_id;

  update public.room_players
  set phase_round_id = null,
      phase_name = null
  where room_id = v_round.room_id;

  return next v_round;
end;
$function$;

create or replace function private.advance_prompt_impl(p_round_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_room public.rooms%rowtype;
  v_option jsonb;
  v_index integer;
  v_sync_timers boolean;
  v_phase_started_at timestamptz;
  v_deadline timestamptz;
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

  if v_round.status <> 'prompt_select' then
    return next v_round;
    return;
  end if;

  if v_round.phase_timer_started_at is null
     or now() < v_round.prompt_selection_ends_at then
    return;
  end if;

  v_index := floor(random() * jsonb_array_length(v_round.prompt_options))::integer;
  v_option := v_round.prompt_options->v_index;

  select * into v_room
  from public.rooms
  where id = v_round.room_id
  for update;

  v_sync_timers := private.phase_timer_sync_enabled_impl(v_round.room_id);
  v_phase_started_at := case when v_sync_timers then null else now() end;
  v_deadline := case
    when v_sync_timers then now() + interval '1 day'
    else now() + make_interval(secs => v_room.round_seconds)
  end;

  update public.game_rounds
  set prompt_term = v_option->>'term',
      prompt_theme = v_option->>'theme',
      status = 'drawing',
      started_at = now(),
      ends_at = v_deadline,
      phase_timer_started_at = v_phase_started_at
  where id = p_round_id
  returning * into v_round;

  update public.rooms
  set status = 'drawing'
  where id = v_round.room_id;

  update public.room_players
  set phase_round_id = null,
      phase_name = null
  where room_id = v_round.room_id;

  return next v_round;
end;
$function$;

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
  v_deadline timestamptz;
  v_sync_timers boolean;
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
    v_sync_timers := private.phase_timer_sync_enabled_impl(v_round.room_id);
    v_phase_started_at := case when v_sync_timers then null else now() end;
    v_deadline := case
      when v_sync_timers then now() + interval '1 day'
      else now() + interval '15 seconds'
    end;

    update public.game_rounds
    set status = 'adjusting',
        revealed_at = coalesce(revealed_at, now()),
        adjustment_ends_at = v_deadline,
        final_reveal_ends_at = null,
        phase_timer_started_at = v_phase_started_at
    where id = p_round_id
      and status = 'drawing';

    update public.rooms
    set status = 'adjusting',
        next_round_at = null
    where id = v_round.room_id;

    update public.room_players
    set ready = false,
        phase_round_id = null,
        phase_name = null
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
  v_sync_timers boolean;
  v_phase_started_at timestamptz;
  v_deadline timestamptz;
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
  if v_round.phase_timer_started_at is null or now() < v_round.ends_at then return; end if;

  select count(*) into v_count
  from public.submissions
  where round_id = p_round_id;

  if v_count < 2 then return; end if;

  v_sync_timers := private.phase_timer_sync_enabled_impl(v_round.room_id);
  v_phase_started_at := case when v_sync_timers then null else now() end;
  v_deadline := case
    when v_sync_timers then now() + interval '1 day'
    else now() + interval '15 seconds'
  end;

  update public.game_rounds
  set status = 'adjusting',
      revealed_at = coalesce(revealed_at, now()),
      adjustment_ends_at = v_deadline,
      final_reveal_ends_at = null,
      phase_timer_started_at = v_phase_started_at
  where id = p_round_id;

  update public.rooms
  set status = 'adjusting',
      next_round_at = null
  where id = v_round.room_id;

  update public.room_players
  set ready = false,
      phase_round_id = null,
      phase_name = null
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
  v_sync_timers boolean;
  v_phase_started_at timestamptz;
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
    update public.room_players
    set ready = false,
        phase_round_id = null,
        phase_name = null
    where room_id = p_room_id;
    return;
  end if;

  if v_round.status = 'adjusting' then
    select count(*) into v_ready_count
    from public.room_players
    where room_id = p_room_id
      and ready is true;

    if v_ready_count >= 2
       or (
         v_round.phase_timer_started_at is not null
         and now() >= v_round.adjustment_ends_at
       ) then
      v_sync_timers := private.phase_timer_sync_enabled_impl(p_room_id);
      v_phase_started_at := case when v_sync_timers then null else now() end;
      v_deadline := case
        when v_sync_timers then now() + interval '1 day'
        else now() + interval '15 seconds'
      end;

      update public.game_rounds
      set status = 'final_reveal',
          final_reveal_ends_at = v_deadline,
          phase_timer_started_at = v_phase_started_at
      where id = v_round.id;

      update public.rooms
      set status = 'final_reveal',
          next_round_at = case when v_sync_timers then null else v_deadline end
      where id = p_room_id;

      update public.room_players
      set ready = false,
          phase_round_id = null,
          phase_name = null
      where room_id = p_room_id;

      v_round.status := 'final_reveal';
      v_round.final_reveal_ends_at := v_deadline;
      v_round.phase_timer_started_at := v_phase_started_at;
    end if;
  end if;

  if v_round.status in ('final_reveal','reveal') then
    select count(*) into v_ready_count
    from public.room_players
    where room_id = p_room_id
      and ready is true;

    if v_ready_count >= 2
       or (
         v_round.phase_timer_started_at is not null
         and now() >= v_round.final_reveal_ends_at
       ) then
      update public.game_rounds
      set status = 'finished'
      where id = v_round.id;

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

      v_sync_timers := private.phase_timer_sync_enabled_impl(p_room_id);
      v_phase_started_at := case when v_sync_timers then null else now() end;
      v_deadline := case
        when v_sync_timers then now() + interval '1 day'
        else now() + interval '15 seconds'
      end;

      set constraints room_players_room_id_role_key deferred;

      update public.room_players
      set role = case when user_id = v_head then 'HEAD' else 'BODY' end,
          ready = false,
          phase_round_id = null,
          phase_name = null
      where room_id = p_room_id;

      insert into public.game_rounds(
        room_id,
        status,
        started_at,
        ends_at,
        head_player_id,
        body_player_id,
        prompt_options,
        prompt_selection_ends_at,
        phase_timer_started_at
      )
      values (
        p_room_id,
        'prompt_select',
        now(),
        v_deadline,
        v_head,
        v_body,
        private.random_prompt_options(),
        v_deadline,
        v_phase_started_at
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

revoke all on function private.start_round_impl(uuid) from public, anon;
grant execute on function private.start_round_impl(uuid) to authenticated, service_role;
revoke all on function private.select_prompt_impl(uuid, text) from public, anon;
grant execute on function private.select_prompt_impl(uuid, text) to authenticated, service_role;
revoke all on function private.advance_prompt_impl(uuid) from public, anon;
grant execute on function private.advance_prompt_impl(uuid) to authenticated, service_role;
revoke all on function private.submit_drawing_impl(uuid, text, jsonb) from public, anon;
grant execute on function private.submit_drawing_impl(uuid, text, jsonb) to authenticated, service_role;
revoke all on function private.advance_drawing_impl(uuid) from public, anon;
grant execute on function private.advance_drawing_impl(uuid) to authenticated, service_role;
revoke all on function private.advance_phase_impl(uuid) from public, anon;
grant execute on function private.advance_phase_impl(uuid) to authenticated, service_role;
