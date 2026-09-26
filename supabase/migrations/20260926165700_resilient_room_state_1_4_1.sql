-- Crocat 1.4.1 resilient session recovery, immediate phases and semantic part labels.

alter table private.drawing_prompts
  add column if not exists head_label text,
  add column if not exists body_label text;

update private.drawing_prompts
set
  head_label = case term
    when 'Lion' then 'Head'
    when 'Frog' then 'Head'
    when 'Owl' then 'Head'
    when 'Shark' then 'Head'
    when 'Penguin' then 'Head'
    when 'Giraffe' then 'Head & Neck'
    when 'Firefighter' then 'Head'
    when 'Astronaut' then 'Helmet'
    when 'Baker' then 'Head'
    when 'Gardener' then 'Head'
    when 'Doctor' then 'Head'
    when 'Detective' then 'Head'
    when 'Pizza' then 'Toppings'
    when 'Burger' then 'Top Bun'
    when 'Sushi' then 'Topping'
    when 'Pretzel' then 'Top Loop'
    when 'Ice Cream' then 'Scoop'
    when 'Taco' then 'Filling'
    when 'Dragon' then 'Head'
    when 'Wizard' then 'Head'
    when 'Witch' then 'Hat & Head'
    when 'Troll' then 'Head'
    when 'Unicorn' then 'Head'
    when 'Knight' then 'Helmet'
    when 'Bicycle' then 'Frame'
    when 'Tractor' then 'Cab'
    when 'Rocket' then 'Nose'
    when 'Submarine' then 'Tower'
    when 'Skateboard' then 'Deck'
    when 'Bus' then 'Cabin'
    when 'Toaster' then 'Slots'
    when 'Umbrella' then 'Canopy'
    when 'Backpack' then 'Top'
    when 'Lamp' then 'Shade'
    when 'Clock' then 'Face'
    when 'Vacuum Cleaner' then 'Handle'
    else 'Upper Part'
  end,
  body_label = case term
    when 'Lion' then 'Body'
    when 'Frog' then 'Legs'
    when 'Owl' then 'Wings'
    when 'Shark' then 'Tail'
    when 'Penguin' then 'Body'
    when 'Giraffe' then 'Body'
    when 'Firefighter' then 'Uniform'
    when 'Astronaut' then 'Spacesuit'
    when 'Baker' then 'Apron'
    when 'Gardener' then 'Outfit'
    when 'Doctor' then 'Coat'
    when 'Detective' then 'Coat'
    when 'Pizza' then 'Crust'
    when 'Burger' then 'Filling'
    when 'Sushi' then 'Rice'
    when 'Pretzel' then 'Bottom Loop'
    when 'Ice Cream' then 'Cone'
    when 'Taco' then 'Shell'
    when 'Dragon' then 'Body'
    when 'Wizard' then 'Robe'
    when 'Witch' then 'Body'
    when 'Troll' then 'Body'
    when 'Unicorn' then 'Body'
    when 'Knight' then 'Armor'
    when 'Bicycle' then 'Wheels'
    when 'Tractor' then 'Wheels'
    when 'Rocket' then 'Engine'
    when 'Submarine' then 'Hull'
    when 'Skateboard' then 'Wheels'
    when 'Bus' then 'Wheels'
    when 'Toaster' then 'Body'
    when 'Umbrella' then 'Handle'
    when 'Backpack' then 'Main Bag'
    when 'Lamp' then 'Stand'
    when 'Clock' then 'Case'
    when 'Vacuum Cleaner' then 'Body'
    else 'Lower Part'
  end;

alter table private.drawing_prompts
  alter column head_label set not null,
  alter column body_label set not null;

alter table public.game_rounds
  add column if not exists prompt_head_label text,
  add column if not exists prompt_body_label text;


CREATE OR REPLACE FUNCTION private.random_prompt_options()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  with chosen_themes as (
    select theme
    from private.drawing_prompts
    group by theme
    order by random()
    limit 3
  ),
  chosen as (
    select
      ct.theme,
      selected.term,
      selected.head_label,
      selected.body_label
    from chosen_themes ct
    cross join lateral (
      select dp.term, dp.head_label, dp.body_label
      from private.drawing_prompts dp
      where dp.theme = ct.theme
      order by random()
      limit 1
    ) selected
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'theme', theme,
      'term', term,
      'headLabel', head_label,
      'bodyLabel', body_label
    )),
    '[]'::jsonb
  )
  from chosen;
$function$;

CREATE OR REPLACE FUNCTION private.reroll_prompt_impl(p_round_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_options jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'prompt_select' then raise exception 'Prompt selection is closed'; end if;
  if v_round.head_player_id <> v_user then raise exception 'Only the upper-part player can reroll prompts'; end if;
  if v_round.prompt_reroll_used then raise exception 'Prompt reroll already used'; end if;
  if now() > v_round.prompt_selection_ends_at then raise exception 'Prompt selection time expired'; end if;

  with old_terms as (
    select value->>'term' as term
    from jsonb_array_elements(v_round.prompt_options)
  ),
  chosen_themes as (
    select dp.theme
    from private.drawing_prompts dp
    where dp.term not in (select term from old_terms)
    group by dp.theme
    order by random()
    limit 3
  ),
  chosen as (
    select
      ct.theme,
      selected.term,
      selected.head_label,
      selected.body_label
    from chosen_themes ct
    cross join lateral (
      select dp.term, dp.head_label, dp.body_label
      from private.drawing_prompts dp
      where dp.theme = ct.theme
        and dp.term not in (select term from old_terms)
      order by random()
      limit 1
    ) selected
  )
  select jsonb_agg(jsonb_build_object(
    'theme', theme,
    'term', term,
    'headLabel', head_label,
    'bodyLabel', body_label
  ))
  into v_options
  from chosen;

  update public.game_rounds
  set prompt_options = v_options,
      prompt_reroll_used = true
  where id = p_round_id
  returning * into v_round;

  return next v_round;
end;
$function$;

CREATE OR REPLACE FUNCTION private.select_prompt_impl(p_round_id uuid, p_term text)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_room public.rooms%rowtype;
  v_option jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'prompt_select' then raise exception 'Prompt selection is closed'; end if;
  if v_round.head_player_id <> v_user then raise exception 'Only the upper-part player can choose the prompt'; end if;
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

  update public.game_rounds
  set prompt_term = v_option->>'term',
      prompt_theme = v_option->>'theme',
      prompt_head_label = v_option->>'headLabel',
      prompt_body_label = v_option->>'bodyLabel',
      status = 'drawing',
      started_at = now(),
      ends_at = now() + make_interval(secs => v_room.round_seconds)
  where id = p_round_id
  returning * into v_round;

  update public.rooms
  set status = 'drawing'
  where id = v_round.room_id;

  return next v_round;
end;
$function$;

CREATE OR REPLACE FUNCTION private.advance_prompt_impl(p_round_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_room public.rooms%rowtype;
  v_option jsonb;
  v_index integer;
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

  if now() < v_round.prompt_selection_ends_at then
    return;
  end if;

  v_index := floor(random() * jsonb_array_length(v_round.prompt_options))::integer;
  v_option := v_round.prompt_options->v_index;

  select * into v_room
  from public.rooms
  where id = v_round.room_id
  for update;

  update public.game_rounds
  set prompt_term = v_option->>'term',
      prompt_theme = v_option->>'theme',
      prompt_head_label = v_option->>'headLabel',
      prompt_body_label = v_option->>'bodyLabel',
      status = 'drawing',
      started_at = now(),
      ends_at = now() + make_interval(secs => v_room.round_seconds)
  where id = p_round_id
  returning * into v_round;

  update public.rooms
  set status = 'drawing'
  where id = v_round.room_id;

  return next v_round;
end;
$function$;

CREATE OR REPLACE FUNCTION private.submit_drawing_impl(p_round_id uuid, p_role text, p_drawing jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
        final_reveal_ends_at = v_phase_started_at + interval '30 seconds'
    where id = p_round_id
      and status = 'drawing';

    update public.rooms
    set status = 'adjusting',
        next_round_at = v_phase_started_at + interval '30 seconds'
    where id = v_round.room_id
      and status = 'drawing';

    update public.room_players
    set ready = false
    where room_id = v_round.room_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.advance_drawing_impl(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_submitted_count integer;
  v_saved_count integer;
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

  select count(*) into v_submitted_count
  from public.submissions
  where round_id = p_round_id
    and submitted is true;

  if v_submitted_count < 2 and now() < v_round.ends_at then
    return;
  end if;

  if now() >= v_round.ends_at then
    select count(*) into v_saved_count
    from public.submissions
    where round_id = p_round_id;

    if v_saved_count < 2 then return; end if;

    update public.submissions
    set submitted = true
    where round_id = p_round_id;
  end if;

  v_phase_started_at := now();

  update public.game_rounds
  set status = 'adjusting',
      revealed_at = coalesce(revealed_at, v_phase_started_at),
      adjustment_ends_at = v_phase_started_at + interval '15 seconds',
      final_reveal_ends_at = v_phase_started_at + interval '30 seconds'
  where id = p_round_id
    and status = 'drawing';

  update public.rooms
  set status = 'adjusting',
      next_round_at = v_phase_started_at + interval '30 seconds'
  where id = v_round.room_id
    and status = 'drawing';

  update public.room_players
  set ready = false
  where room_id = v_round.room_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_ready_impl(p_room_id uuid, p_ready boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room_status text;
  v_ready_count integer;
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
      or r.status in ('final_reveal','reveal')
    )
  returning r.status into v_room_status;

  if not found then
    raise exception 'Ready state is unavailable for this player in the current phase';
  end if;

  if v_room_status in ('final_reveal','reveal') and coalesce(p_ready, false) then
    select count(*) into v_ready_count
    from public.room_players
    where room_id = p_room_id
      and ready is true;

    if v_ready_count >= 2 then
      perform private.advance_phase_impl(p_room_id);
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_room_state_impl(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_before text;
  v_after text;
  v_submitted_count integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  for i in 1..4 loop
    select * into v_round
    from public.game_rounds
    where room_id = p_room_id
      and status in ('prompt_select','drawing','adjusting','final_reveal','reveal')
    order by created_at desc
    limit 1;

    if not found then return; end if;

    v_before := v_round.status;

    if v_round.status = 'prompt_select'
       and v_round.prompt_selection_ends_at is not null
       and now() >= v_round.prompt_selection_ends_at then
      perform private.advance_prompt_impl(v_round.id);

    elsif v_round.status = 'drawing' then
      select count(*) into v_submitted_count
      from public.submissions
      where round_id = v_round.id
        and submitted is true;

      if v_submitted_count >= 2
         or (v_round.ends_at is not null and now() >= v_round.ends_at) then
        perform private.advance_drawing_impl(v_round.id);
      end if;

    elsif v_round.status in ('adjusting','final_reveal','reveal') then
      perform private.advance_phase_impl(p_room_id);
    end if;

    select status into v_after
    from public.game_rounds
    where id = v_round.id;

    if v_after = v_before then
      return;
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_room_state(p_room_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select private.sync_room_state_impl(p_room_id);
$function$;


revoke all on function private.sync_room_state_impl(uuid) from public;
grant execute on function private.sync_room_state_impl(uuid) to authenticated;
revoke all on function public.sync_room_state(uuid) from public, anon;
grant execute on function public.sync_room_state(uuid) to authenticated;
