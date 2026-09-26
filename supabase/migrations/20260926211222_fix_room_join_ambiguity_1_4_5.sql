-- Crocat 1.4.5 hotfix: qualify room_players columns inside table-returning join functions.

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
    update public.room_players rp
    set last_seen_at = now()
    where rp.room_id = v_room.id
      and rp.user_id = v_user;

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

  insert into public.room_players(room_id, user_id, display_name, role, last_seen_at)
  values (v_room.id, v_user, v_guest_name, 'BODY', now());

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$function$;
