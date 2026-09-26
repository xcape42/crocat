-- Crocat 1.4.5: immediate phase transitions, direct room links, heartbeats and stale-room cleanup.

create extension if not exists pg_cron;

alter table public.room_players
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists room_players_last_seen_at_idx
  on public.room_players(last_seen_at);

create or replace function private.touch_room_presence_impl(p_room_id uuid)
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
  set last_seen_at = now()
  where room_id = p_room_id
    and user_id = v_user;

  if not found then
    raise exception 'You are not a member of this room';
  end if;
end;
$function$;

create or replace function public.touch_room_presence(p_room_id uuid)
returns void
language sql
security definer
set search_path = public, private, pg_temp
as $function$
  select private.touch_room_presence_impl(p_room_id);
$function$;

revoke all on function private.touch_room_presence_impl(uuid) from public;
revoke all on function public.touch_room_presence(uuid) from public, anon;
grant execute on function public.touch_room_presence(uuid) to authenticated;

create or replace function private.cleanup_stale_rooms_impl()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_deleted integer;
begin
  delete from public.rooms r
  where not exists (
    select 1
    from public.room_players rp
    where rp.room_id = r.id
      and rp.last_seen_at >= now() - interval '1 minute'
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function private.cleanup_stale_rooms_impl() from public;

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
    update public.room_players
    set last_seen_at = now()
    where room_id = v_room.id
      and user_id = v_user;

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

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, p_display_name, 'BODY', now());

  return query select v_room.id, v_room.code, 'BODY'::text;
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
    update public.room_players
    set last_seen_at = now()
    where room_id = v_room.id
      and user_id = v_user;

    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, v_guest_name, 'BODY', now());

  return query select v_room.id, v_room.code, 'BODY'::text;
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
    where id = v_round.room_id;

    update public.room_players
    set ready = false
    where room_id = v_round.room_id;
  end if;
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

  if not exists (
    select 1 from public.room_players where room_id = p_room_id
  ) then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

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

do $do$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname = 'crocat-clean-stale-rooms'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end
$do$;

select cron.schedule(
  'crocat-clean-stale-rooms',
  '* * * * *',
  $cron$select private.cleanup_stale_rooms_impl();$cron$
);
