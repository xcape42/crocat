-- Restore Crocat 1.4.0 database behavior while preserving forward migration history.

-- 1.4.1/1.4.2 may already have been deployed; this down-migration rolls behavior forward to 1.4.0.

create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = (select auth.uid())
  );
$$;

create or replace function private.make_room_code()
returns text
language sql
volatile
security invoker
set search_path = pg_catalog
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

create or replace function private.create_room_impl(
  p_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room_id uuid;
  v_code text;
  v_try integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  p_display_name := btrim(p_display_name);
  if char_length(p_display_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  p_round_seconds := greatest(10, least(coalesce(p_round_seconds, 180), 600));

  loop
    v_try := v_try + 1;
    v_code := private.make_room_code();
    begin
      insert into public.rooms(code, host_id, round_seconds)
      values (v_code, v_user, p_round_seconds)
      returning id into v_room_id;
      exit;
    exception when unique_violation then
      if v_try >= 8 then
        raise exception 'Could not allocate a room code';
      end if;
    end;
  end loop;

  insert into public.room_players(room_id, user_id, display_name, role)
  values (v_room_id, v_user, p_display_name, 'HEAD');

  return query select v_room_id, v_code, 'HEAD'::text;
end;
$$;

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
    );

  if not found then
    raise exception 'Ready state is unavailable for this player in the current phase';
  end if;
end;
$$;

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

create or replace function public.create_room(
  p_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.create_room_impl(p_display_name, p_round_seconds);
$$;

create or replace function public.join_room(
  p_code text,
  p_display_name text
)
returns table(room_id uuid, room_code text, player_role text)
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.join_room_impl(p_code, p_display_name);
$$;

create or replace function public.set_ready(p_room_id uuid, p_ready boolean)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.set_ready_impl(p_room_id, p_ready);
$$;

create or replace function public.start_round(p_room_id uuid)
returns setof public.game_rounds
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.start_round_impl(p_room_id);
$$;

create or replace function public.submit_drawing(
  p_round_id uuid,
  p_role text,
  p_drawing jsonb
)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.submit_drawing_impl(p_round_id, p_role, p_drawing);
$$;

create or replace function private.advance_round_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player_count integer;
  v_ready_count integer;
  v_round public.game_rounds%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  if v_room.status <> 'reveal' then
    return;
  end if;

  select count(*) into v_player_count
  from public.room_players rp
  where rp.room_id = p_room_id;

  if v_player_count < 2 then
    update public.game_rounds
    set status = 'finished'
    where room_id = p_room_id
      and status = 'reveal';

    update public.rooms
    set status = 'waiting',
        next_round_at = null
    where id = p_room_id;

    update public.room_players
    set ready = false
    where room_id = p_room_id;

    return;
  end if;

  select count(*) into v_ready_count
  from public.room_players rp
  where rp.room_id = p_room_id
    and rp.ready is true;

  if v_ready_count < 2
     and (v_room.next_round_at is null or now() < v_room.next_round_at) then
    return;
  end if;

  update public.game_rounds
  set status = 'finished'
  where room_id = p_room_id
    and status = 'reveal';

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

create or replace function public.advance_round(p_room_id uuid)
returns setof public.game_rounds
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.advance_round_impl(p_room_id);
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.leave_room_impl(p_room_id);
$$;

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

create or replace function public.save_transform(
  p_round_id uuid,
  p_role text,
  p_transform jsonb
)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.save_transform_impl(p_round_id, p_role, p_transform);
$$;

create or replace function public.advance_phase(p_room_id uuid)
returns setof public.game_rounds
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.advance_phase_impl(p_room_id);
$$;

create or replace function private.join_or_create_room_impl(
  p_code text,
  p_host_display_name text,
  p_guest_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_host_name text := btrim(p_host_display_name);
  v_guest_name text := btrim(p_guest_display_name);
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
  v_room_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Room code must contain exactly 6 letters or numbers';
  end if;
  if char_length(v_host_name) not between 2 and 18
     or char_length(v_guest_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  p_round_seconds := greatest(10, least(coalesce(p_round_seconds, 180), 600));
  perform pg_advisory_xact_lock(hashtext(v_code)::bigint);

  select r.* into v_room
  from public.rooms r
  where r.code = v_code
  for update;

  if not found then
    insert into public.rooms(code, host_id, round_seconds)
    values (v_code, v_user, p_round_seconds)
    returning id into v_room_id;

    insert into public.room_players(room_id, user_id, display_name, role)
    values (v_room_id, v_user, v_host_name, 'HEAD');

    return query select v_room_id, v_code, 'HEAD'::text;
    return;
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  insert into public.room_players(room_id, user_id, display_name, role)
  values (v_room.id, v_user, v_guest_name, 'BODY');

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$$;

create or replace function public.join_or_create_room(
  p_code text,
  p_host_display_name text,
  p_guest_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.join_or_create_room_impl(
    p_code,
    p_host_display_name,
    p_guest_display_name,
    p_round_seconds
  );
$$;

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

drop function if exists public.sync_room_state(uuid);

drop function if exists private.sync_room_state_impl(uuid);

alter table public.game_rounds drop column if exists prompt_head_label, drop column if exists prompt_body_label;

alter table private.drawing_prompts drop column if exists head_label, drop column if exists body_label;