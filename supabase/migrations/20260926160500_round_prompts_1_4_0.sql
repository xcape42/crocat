-- Crocat 1.4.0 random roles, themed prompts and reversible submissions.

create table if not exists private.drawing_prompts (
  theme text not null,
  term text not null,
  primary key (theme, term)
);

insert into private.drawing_prompts(theme, term) values
  ('Animals','Lion'),('Animals','Frog'),('Animals','Owl'),('Animals','Shark'),('Animals','Penguin'),('Animals','Giraffe'),
  ('Professions','Firefighter'),('Professions','Astronaut'),('Professions','Baker'),('Professions','Gardener'),('Professions','Doctor'),('Professions','Detective'),
  ('Food','Pizza'),('Food','Burger'),('Food','Sushi'),('Food','Pretzel'),('Food','Ice Cream'),('Food','Taco'),
  ('Fantasy','Dragon'),('Fantasy','Wizard'),('Fantasy','Witch'),('Fantasy','Troll'),('Fantasy','Unicorn'),('Fantasy','Knight'),
  ('Vehicles','Bicycle'),('Vehicles','Tractor'),('Vehicles','Rocket'),('Vehicles','Submarine'),('Vehicles','Skateboard'),('Vehicles','Bus'),
  ('Objects','Toaster'),('Objects','Umbrella'),('Objects','Backpack'),('Objects','Lamp'),('Objects','Clock'),('Objects','Vacuum Cleaner')
on conflict do nothing;

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check
  check (status in ('waiting','prompt_select','drawing','adjusting','final_reveal','reveal','finished'));

alter table public.game_rounds drop constraint if exists game_rounds_status_check;
alter table public.game_rounds
  add constraint game_rounds_status_check
  check (status in ('prompt_select','drawing','adjusting','final_reveal','reveal','finished'));

alter table public.room_players drop constraint if exists room_players_room_id_role_key;
alter table public.room_players
  add constraint room_players_room_id_role_key
  unique (room_id, role)
  deferrable initially deferred;

alter table public.game_rounds
  add column if not exists head_player_id uuid references auth.users(id) on delete cascade,
  add column if not exists body_player_id uuid references auth.users(id) on delete cascade,
  add column if not exists prompt_options jsonb not null default '[]'::jsonb,
  add column if not exists prompt_term text,
  add column if not exists prompt_theme text,
  add column if not exists prompt_selection_ends_at timestamptz,
  add column if not exists prompt_reroll_used boolean not null default false;

alter table public.submissions
  add column if not exists submitted boolean not null default true;

create index if not exists game_rounds_head_player_id_idx on public.game_rounds(head_player_id);
create index if not exists game_rounds_body_player_id_idx on public.game_rounds(body_player_id);


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
      (
        select dp.term
        from private.drawing_prompts dp
        where dp.theme = ct.theme
        order by random()
        limit 1
      ) as term
    from chosen_themes ct
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('theme', theme, 'term', term)),
    '[]'::jsonb
  )
  from chosen;
$function$;

CREATE OR REPLACE FUNCTION private.start_round_impl(p_room_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player_count integer;
  v_guest_ready integer;
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

  if not found or v_room.host_id <> v_user then
    raise exception 'Only the host can start the round';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not waiting';
  end if;

  select count(*) into v_player_count
  from public.room_players
  where room_id = p_room_id;

  if v_player_count <> 2 then
    raise exception 'Two players are required';
  end if;

  select count(*) into v_guest_ready
  from public.room_players
  where room_id = p_room_id
    and user_id <> v_room.host_id
    and ready is true;

  if v_guest_ready <> 1 then
    raise exception 'Guest must be ready';
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
  returning * into v_round;

  update public.rooms
  set status = 'prompt_select',
      next_round_at = null
  where id = p_room_id;

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

  update public.game_rounds
  set prompt_term = v_option->>'term',
      prompt_theme = v_option->>'theme',
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
  if v_round.head_player_id <> v_user then raise exception 'Only the HEAD player can reroll prompts'; end if;
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
      (
        select dp.term
        from private.drawing_prompts dp
        where dp.theme = ct.theme
          and dp.term not in (select term from old_terms)
        order by random()
        limit 1
      ) as term
    from chosen_themes ct
  )
  select jsonb_agg(jsonb_build_object('theme', theme, 'term', term))
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
end;
$function$;

CREATE OR REPLACE FUNCTION private.resume_drawing_impl(p_round_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id;

  if not found then raise exception 'Round not found'; end if;
  if v_round.status <> 'drawing' or now() >= v_round.ends_at then
    raise exception 'Drawing can no longer be resumed';
  end if;

  update public.submissions
  set submitted = false
  where round_id = p_round_id
    and player_id = v_user;

  if not found then raise exception 'No submitted drawing to resume'; end if;
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
      final_reveal_ends_at = v_phase_started_at + interval '30 seconds'
  where id = p_round_id;

  update public.rooms
  set status = 'adjusting',
      next_round_at = v_phase_started_at + interval '30 seconds'
  where id = v_round.room_id;

  update public.room_players
  set ready = false
  where room_id = v_round.room_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_transform_impl(p_round_id uuid, p_role text, p_transform jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_expected_role text;
  v_x numeric;
  v_y numeric;
  v_scale numeric;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_round
  from public.game_rounds
  where id = p_round_id
  for update;

  if not found then raise exception 'Round not found'; end if;

  if v_round.status not in ('adjusting','final_reveal')
     or v_round.adjustment_ends_at is null
     or now() > v_round.adjustment_ends_at + interval '2 seconds' then
    raise exception 'Adjustment phase is closed';
  end if;

  v_expected_role := case
    when v_round.head_player_id = v_user then 'HEAD'
    when v_round.body_player_id = v_user then 'BODY'
    else null
  end;

  if v_expected_role is null or v_expected_role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_transform is null
     or jsonb_typeof(p_transform) <> 'object'
     or coalesce(jsonb_typeof(p_transform->'x'), '') <> 'number'
     or coalesce(jsonb_typeof(p_transform->'y'), '') <> 'number'
     or coalesce(jsonb_typeof(p_transform->'scale'), '') <> 'number' then
    raise exception 'Invalid transform payload';
  end if;

  v_x := (p_transform->>'x')::numeric;
  v_y := (p_transform->>'y')::numeric;
  v_scale := (p_transform->>'scale')::numeric;

  if v_x < -360 or v_x > 360
     or v_y < -760 or v_y > 760
     or v_scale < 0.75 or v_scale > 1.30 then
    raise exception 'Transform outside allowed range';
  end if;

  update public.submissions
  set transform = jsonb_build_object('x', v_x, 'y', v_y, 'scale', v_scale)
  where round_id = p_round_id
    and player_id = v_user
    and role = p_role;

  if not found then raise exception 'Submission not found'; end if;
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

  if v_round.status = 'adjusting'
     and v_round.adjustment_ends_at is not null
     and now() >= v_round.adjustment_ends_at then
    update public.game_rounds set status = 'final_reveal' where id = v_round.id;
    update public.rooms set status = 'final_reveal' where id = p_room_id;
    update public.room_players set ready = false where room_id = p_room_id;
    v_round.status := 'final_reveal';
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

CREATE OR REPLACE FUNCTION private.leave_room_impl(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then return; end if;
  if not private.is_room_member(p_room_id) then return; end if;

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
    and status in ('prompt_select','drawing','adjusting','final_reveal','reveal');

  update public.rooms
  set status = 'waiting',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.select_prompt(p_round_id uuid, p_term text)
 RETURNS SETOF game_rounds
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select * from private.select_prompt_impl(p_round_id, p_term); $function$;

CREATE OR REPLACE FUNCTION public.reroll_prompt(p_round_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select * from private.reroll_prompt_impl(p_round_id); $function$;

CREATE OR REPLACE FUNCTION public.advance_prompt(p_round_id uuid)
 RETURNS SETOF game_rounds
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select * from private.advance_prompt_impl(p_round_id); $function$;

CREATE OR REPLACE FUNCTION public.resume_drawing(p_round_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.resume_drawing_impl(p_round_id); $function$;

CREATE OR REPLACE FUNCTION public.advance_drawing(p_round_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ select private.advance_drawing_impl(p_round_id); $function$;


revoke all on function private.random_prompt_options() from public;
revoke all on function private.select_prompt_impl(uuid,text) from public;
revoke all on function private.reroll_prompt_impl(uuid) from public;
revoke all on function private.advance_prompt_impl(uuid) from public;
revoke all on function private.resume_drawing_impl(uuid) from public;
revoke all on function private.advance_drawing_impl(uuid) from public;

grant execute on function private.select_prompt_impl(uuid,text) to authenticated;
grant execute on function private.reroll_prompt_impl(uuid) to authenticated;
grant execute on function private.advance_prompt_impl(uuid) to authenticated;
grant execute on function private.resume_drawing_impl(uuid) to authenticated;
grant execute on function private.advance_drawing_impl(uuid) to authenticated;

revoke all on function public.select_prompt(uuid,text) from public, anon;
revoke all on function public.reroll_prompt(uuid) from public, anon;
revoke all on function public.advance_prompt(uuid) from public, anon;
revoke all on function public.resume_drawing(uuid) from public, anon;
revoke all on function public.advance_drawing(uuid) from public, anon;

grant execute on function public.select_prompt(uuid,text) to authenticated;
grant execute on function public.reroll_prompt(uuid) to authenticated;
grant execute on function public.advance_prompt(uuid) to authenticated;
grant execute on function public.resume_drawing(uuid) to authenticated;
grant execute on function public.advance_drawing(uuid) to authenticated;
