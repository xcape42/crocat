-- Crocat 1.4.9 phase 1: equal lobby players with backward-compatible start behavior.
-- rooms.host_id remains only as a legacy room reference and grants no lobby privileges.

comment on column public.rooms.host_id is
  'Legacy room reference for compatibility; does not grant lobby privileges.';

create or replace function private.set_ready_impl(
  p_room_id uuid,
  p_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
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
    and r.status in ('waiting','adjusting','final_reveal','reveal');

  if not found then
    raise exception 'Ready state is unavailable for this player in the current phase';
  end if;
end;
$function$;

create or replace function private.update_room_settings_impl(
  p_room_id uuid,
  p_round_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
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
  if not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = v_user
  ) then
    raise exception 'You are not a member of this room';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'Room settings can only be changed while waiting';
  end if;

  v_seconds := greatest(10, least(coalesce(p_round_seconds, v_room.round_seconds), 600));

  update public.rooms
  set round_seconds = v_seconds
  where id = p_room_id;

  -- Settings affect both players, so both must confirm Ready again.
  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$function$;

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
  v_legacy_other_ready integer;
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

  -- Temporary compatibility for the already-deployed 1.4.8 client:
  -- its legacy creator cannot mark itself Ready and starts after the other player is Ready.
  if v_ready_count <> 2 then
    select count(*) into v_legacy_other_ready
    from public.room_players
    where room_id = p_room_id
      and user_id <> v_room.host_id
      and ready is true;

    if not (
      v_room.host_id = v_user
      and v_ready_count = 1
      and v_legacy_other_ready = 1
    ) then
      raise exception 'Both players must be ready';
    end if;
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

create or replace function private.leave_room_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_remaining_user uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then return; end if;
  if not private.is_room_member(p_room_id) then return; end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_user;

  select rp.user_id into v_remaining_user
  from public.room_players rp
  where rp.room_id = p_room_id
  order by rp.joined_at
  limit 1;

  if v_remaining_user is null then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  update public.game_rounds
  set status = 'finished'
  where room_id = p_room_id
    and status in ('prompt_select','drawing','adjusting','final_reveal','reveal');

  update public.rooms
  set host_id = case when host_id = v_user then v_remaining_user else host_id end,
      status = 'waiting',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$function$;

create or replace function private.join_room_impl(
  p_code text,
  p_display_name text
)
returns table(room_id uuid, room_code text, player_role text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
  v_join_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  p_code := upper(btrim(p_code));
  p_display_name := btrim(p_display_name);

  if char_length(p_display_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.code = p_code
  for update;

  if not found then raise exception 'Room not found'; end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    update public.room_players rp
    set last_seen_at = now()
    where rp.room_id = v_room.id
      and rp.user_id = v_user;

    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  v_join_role := case
    when exists (
      select 1 from public.room_players rp
      where rp.room_id = v_room.id
        and rp.role = 'HEAD'
    ) then 'BODY'
    else 'HEAD'
  end;

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, p_display_name, v_join_role, now());

  return query select v_room.id, v_room.code, v_join_role;
end;
$function$;

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
as $function$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_host_name text := btrim(p_host_display_name);
  v_guest_name text := btrim(p_guest_display_name);
  v_room public.rooms%rowtype;
  v_existing public.room_players%rowtype;
  v_count integer;
  v_room_id uuid;
  v_join_role text;
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

    insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
    values (v_room_id, v_user, v_host_name, 'HEAD', now());

    return query select v_room_id, v_code, 'HEAD'::text;
    return;
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    update public.room_players rp
    set last_seen_at = now()
    where rp.room_id = v_room.id
      and rp.user_id = v_user;

    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  v_join_role := case
    when exists (
      select 1 from public.room_players rp
      where rp.room_id = v_room.id
        and rp.role = 'HEAD'
    ) then 'BODY'
    else 'HEAD'
  end;

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, v_guest_name, v_join_role, now());

  return query select v_room.id, v_room.code, v_join_role;
end;
$function$;
