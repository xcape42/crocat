-- Crocat 1.6.0: social play entry, friendship progress and safer lobby switching.

create or replace function private.friendship_progress(
  p_left uuid,
  p_right uuid
)
returns table(
  friend_level integer,
  shared_rounds integer,
  friendship_label text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  with stats as (
    select count(*)::integer as rounds
    from public.game_rounds g
    where g.status = 'finished'
      and (
        (g.head_player_id = p_left and g.body_player_id = p_right)
        or (g.head_player_id = p_right and g.body_player_id = p_left)
      )
  )
  select
    case
      when rounds >= 10 then 3
      when rounds >= 3 then 2
      else 1
    end,
    rounds,
    case
      when rounds >= 10 then 'CROCAT CREW'
      when rounds >= 3 then 'DRAW BUDDIES'
      else 'NEW FRIEND'
    end
  from stats;
$function$;

revoke all on function private.friendship_progress(uuid, uuid) from public;

drop function if exists public.list_friends();

create function public.list_friends()
returns table(
  friend_user_id uuid,
  display_name text,
  friend_code text,
  color_key text,
  avatar_key text,
  theme_key text,
  symbol_key text,
  last_seen_at timestamptz,
  online boolean,
  open_room_code text,
  friend_level integer,
  shared_rounds integer,
  friendship_label text
)
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

  return query
  with accepted as (
    select
      case
        when f.user_a = v_user then f.user_b
        else f.user_a
      end as friend_id
    from public.friendships f
    where f.status = 'accepted'
      and (f.user_a = v_user or f.user_b = v_user)
  ),
  activity as (
    select
      rp.user_id,
      max(rp.last_seen_at) as room_last_seen
    from public.room_players rp
    group by rp.user_id
  )
  select
    p.user_id,
    p.display_name,
    p.friend_code,
    p.color_key,
    p.avatar_key,
    p.theme_key,
    p.symbol_key,
    greatest(
      p.last_seen_at,
      coalesce(a.room_last_seen, p.last_seen_at)
    ),
    greatest(
      p.last_seen_at,
      coalesce(a.room_last_seen, p.last_seen_at)
    ) >= now() - interval '45 seconds',
    (
      select r.code
      from public.rooms r
      join public.room_players rp2
        on rp2.room_id = r.id
      where rp2.user_id = p.user_id
        and r.status = 'waiting'
        and (
          select count(*)
          from public.room_players x
          where x.room_id = r.id
        ) < 2
      order by r.created_at desc
      limit 1
    ),
    progress.friend_level,
    progress.shared_rounds,
    progress.friendship_label
  from accepted af
  join public.profiles p
    on p.user_id = af.friend_id
  left join activity a
    on a.user_id = p.user_id
  cross join lateral private.friendship_progress(v_user, p.user_id) progress
  order by
    (
      greatest(
        p.last_seen_at,
        coalesce(a.room_last_seen, p.last_seen_at)
      ) >= now() - interval '45 seconds'
    ) desc,
    p.display_name,
    p.user_id;
end;
$function$;

revoke all on function public.list_friends() from public, anon;
grant execute on function public.list_friends() to authenticated;

create or replace function private.send_friend_request_to_user_impl(
  p_other_user_id uuid
)
returns public.friendships
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_existing public.friendships%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  perform private.ensure_profile_impl(null);

  if p_other_user_id is null or p_other_user_id = v_user then
    raise exception 'Invalid friend';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.user_id = p_other_user_id
  ) then
    raise exception 'Player profile is unavailable';
  end if;

  select n.user_a, n.user_b
  into v_a, v_b
  from private.normalized_friend_pair(v_user, p_other_user_id) n;

  select f.* into v_existing
  from public.friendships f
  where f.user_a = v_a
    and f.user_b = v_b
  for update;

  if found then
    if v_existing.status = 'accepted' then
      return v_existing;
    end if;

    if v_existing.requested_by <> v_user then
      update public.friendships f
      set status = 'accepted',
          responded_at = now()
      where f.id = v_existing.id
      returning f.* into v_existing;
    end if;

    return v_existing;
  end if;

  insert into public.friendships(
    user_a,
    user_b,
    requested_by,
    status
  )
  values (
    v_a,
    v_b,
    v_user,
    'pending'
  )
  returning * into v_existing;

  return v_existing;
end;
$function$;

revoke all on function private.send_friend_request_to_user_impl(uuid) from public;
grant execute on function private.send_friend_request_to_user_impl(uuid) to authenticated;

create or replace function public.send_friend_request_to_user(
  p_other_user_id uuid
)
returns public.friendships
language sql
set search_path = public, private, pg_temp
as $function$
  select private.send_friend_request_to_user_impl(p_other_user_id);
$function$;

revoke all on function public.send_friend_request_to_user(uuid) from public, anon;
grant execute on function public.send_friend_request_to_user(uuid) to authenticated;

create or replace function private.open_or_create_room_impl(
  p_display_name text,
  p_round_seconds integer default 180
)
returns table(
  room_id uuid,
  room_code text,
  player_role text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_existing_room_id uuid;
  v_room public.rooms%rowtype;
  v_role text;
  v_ticket record;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  p_display_name := btrim(p_display_name);
  if char_length(p_display_name) not between 2 and 18 then
    raise exception 'Display name must be 2-18 characters';
  end if;

  p_round_seconds := greatest(10, least(coalesce(p_round_seconds, 180), 600));

  perform pg_advisory_xact_lock(hashtext(v_user::text)::bigint);

  select r.id
  into v_existing_room_id
  from public.rooms r
  join public.room_players rp
    on rp.room_id = r.id
  where rp.user_id = v_user
  order by
    case when r.status = 'waiting' then 1 else 0 end,
    r.created_at desc
  limit 1;

  if v_existing_room_id is not null then
    select r.*
    into v_room
    from public.rooms r
    where r.id = v_existing_room_id
    for update;

    select rp.role
    into v_role
    from public.room_players rp
    where rp.room_id = v_room.id
      and rp.user_id = v_user;

    update public.room_players rp
    set display_name = p_display_name,
        last_seen_at = now()
    where rp.room_id = v_room.id
      and rp.user_id = v_user;

    delete from public.rooms r
    where r.id <> v_room.id
      and r.status = 'waiting'
      and exists (
        select 1
        from public.room_players mine
        where mine.room_id = r.id
          and mine.user_id = v_user
      )
      and (
        select count(*)
        from public.room_players members
        where members.room_id = r.id
      ) = 1;

    return query
    select v_room.id, v_room.code, v_role;
    return;
  end if;

  select *
  into v_ticket
  from private.create_room_impl(p_display_name, p_round_seconds)
  limit 1;

  return query
  select
    v_ticket.room_id,
    v_ticket.room_code,
    v_ticket.player_role;
end;
$function$;

revoke all on function private.open_or_create_room_impl(text, integer) from public;
grant execute on function private.open_or_create_room_impl(text, integer) to authenticated;

create or replace function public.open_or_create_room(
  p_display_name text,
  p_round_seconds integer default 180
)
returns table(
  room_id uuid,
  room_code text,
  player_role text
)
language sql
set search_path = public, private, pg_temp
as $function$
  select *
  from private.open_or_create_room_impl(
    p_display_name,
    p_round_seconds
  );
$function$;

revoke all on function public.open_or_create_room(text, integer) from public, anon;
grant execute on function public.open_or_create_room(text, integer) to authenticated;

create or replace function private.regenerate_room_code_impl(
  p_room_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_count integer;
  v_code text;
  v_try integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select r.*
  into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found or not private.is_room_member(p_room_id) then
    raise exception 'Room is unavailable';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room code can only change while waiting';
  end if;

  select count(*)
  into v_count
  from public.room_players rp
  where rp.room_id = p_room_id;

  if v_count <> 1 then
    raise exception 'Room code can only change while you are alone';
  end if;

  loop
    v_try := v_try + 1;
    v_code := private.make_room_code();

    begin
      update public.rooms r
      set code = v_code
      where r.id = p_room_id;
      exit;
    exception when unique_violation then
      if v_try >= 8 then
        raise exception 'Could not allocate a room code';
      end if;
    end;
  end loop;

  return v_code;
end;
$function$;

revoke all on function private.regenerate_room_code_impl(uuid) from public;
grant execute on function private.regenerate_room_code_impl(uuid) to authenticated;

create or replace function public.regenerate_room_code(
  p_room_id uuid
)
returns text
language sql
set search_path = public, private, pg_temp
as $function$
  select private.regenerate_room_code_impl(p_room_id);
$function$;

revoke all on function public.regenerate_room_code(uuid) from public, anon;
grant execute on function public.regenerate_room_code(uuid) to authenticated;

create or replace function private.join_friend_lobby_impl(
  p_friend_user_id uuid,
  p_current_room_id uuid default null
)
returns table(
  room_id uuid,
  room_code text,
  player_role text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_target public.rooms%rowtype;
  v_current public.rooms%rowtype;
  v_current_room_id uuid;
  v_current_count integer;
  v_existing_role text;
  v_ticket record;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not private.are_friends(v_user, p_friend_user_id) then
    raise exception 'You can only join a friend';
  end if;

  if p_friend_user_id = v_user then
    raise exception 'Invalid friend';
  end if;

  select r.*
  into v_target
  from public.rooms r
  join public.room_players rp
    on rp.room_id = r.id
  where rp.user_id = p_friend_user_id
    and r.status = 'waiting'
    and (
      select count(*)
      from public.room_players members
      where members.room_id = r.id
    ) < 2
  order by r.created_at desc
  limit 1
  for update of r;

  if not found then
    raise exception 'Friend no longer has an open lobby';
  end if;

  select rp.role
  into v_existing_role
  from public.room_players rp
  where rp.room_id = v_target.id
    and rp.user_id = v_user;

  if found then
    return query
    select v_target.id, v_target.code, v_existing_role;
    return;
  end if;

  if p_current_room_id is not null then
    v_current_room_id := p_current_room_id;
  else
    select r.id
    into v_current_room_id
    from public.rooms r
    join public.room_players rp
      on rp.room_id = r.id
    where rp.user_id = v_user
      and r.id <> v_target.id
    order by
      case when r.status = 'waiting' then 1 else 0 end,
      r.created_at desc
    limit 1;
  end if;

  if v_current_room_id is not null then
    select r.*
    into v_current
    from public.rooms r
    where r.id = v_current_room_id
    for update;

    if not found or not private.is_room_member(v_current_room_id) then
      raise exception 'Current room is unavailable';
    end if;

    if v_current.status <> 'waiting' then
      raise exception 'Leave your current game before joining a friend';
    end if;

    select count(*)
    into v_current_count
    from public.room_players rp
    where rp.room_id = v_current_room_id;

    if v_current_count <> 1 then
      raise exception 'Current lobby already has another player';
    end if;

    perform private.leave_room_impl(v_current_room_id);
  end if;

  v_profile := private.ensure_profile_impl(null);

  select *
  into v_ticket
  from private.join_room_impl(v_target.code, v_profile.display_name)
  limit 1;

  return query
  select
    v_ticket.room_id,
    v_ticket.room_code,
    v_ticket.player_role;
end;
$function$;

revoke all on function private.join_friend_lobby_impl(uuid, uuid) from public;
grant execute on function private.join_friend_lobby_impl(uuid, uuid) to authenticated;

create or replace function public.join_friend_lobby(
  p_friend_user_id uuid,
  p_current_room_id uuid default null
)
returns table(
  room_id uuid,
  room_code text,
  player_role text
)
language sql
set search_path = public, private, pg_temp
as $function$
  select *
  from private.join_friend_lobby_impl(
    p_friend_user_id,
    p_current_room_id
  );
$function$;

revoke all on function public.join_friend_lobby(uuid, uuid) from public, anon;
grant execute on function public.join_friend_lobby(uuid, uuid) to authenticated;

create or replace function public.invite_friend(
  p_friend_user_id uuid,
  p_room_id uuid default null
)
returns table(
  invite_id uuid,
  room_id uuid,
  room_code text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_room public.rooms%rowtype;
  v_ticket record;
  v_invite public.lobby_invites%rowtype;
  v_existing_room_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not private.are_friends(v_user, p_friend_user_id) then
    raise exception 'You can only invite friends';
  end if;

  v_profile := private.ensure_profile_impl(null);

  if p_room_id is not null then
    select r.* into v_room
    from public.rooms r
    where r.id = p_room_id
    for update;

    if not found
       or v_room.status <> 'waiting'
       or not private.is_room_member(v_room.id)
       or (
         select count(*)
         from public.room_players rp
         where rp.room_id = v_room.id
       ) >= 2 then
      raise exception 'This lobby is not open';
    end if;
  else
    if exists (
      select 1
      from public.rooms active_room
      join public.room_players active_player
        on active_player.room_id = active_room.id
      where active_player.user_id = v_user
        and active_room.status <> 'waiting'
    ) then
      raise exception 'Leave your current game before inviting a friend';
    end if;

    select r.id into v_existing_room_id
    from public.rooms r
    join public.room_players rp
      on rp.room_id = r.id
    where rp.user_id = v_user
      and r.status = 'waiting'
      and (
        select count(*)
        from public.room_players x
        where x.room_id = r.id
      ) < 2
    order by r.created_at desc
    limit 1;

    if v_existing_room_id is not null then
      select r.* into v_room
      from public.rooms r
      where r.id = v_existing_room_id
      for update;
    else
      if exists (
        select 1
        from public.rooms occupied_room
        join public.room_players occupied_player
          on occupied_player.room_id = occupied_room.id
        where occupied_player.user_id = v_user
          and occupied_room.status = 'waiting'
      ) then
        raise exception 'Your current lobby already has another player';
      end if;

      select *
      into v_ticket
      from private.create_room_impl(v_profile.display_name, 180)
      limit 1;

      select r.* into v_room
      from public.rooms r
      where r.id = v_ticket.room_id;
    end if;
  end if;

  if exists (
    select 1
    from public.room_players rp
    where rp.room_id = v_room.id
      and rp.user_id = p_friend_user_id
  ) then
    raise exception 'Friend is already in this lobby';
  end if;

  update public.lobby_invites i
  set status = 'declined',
      responded_at = now()
  where i.sender_id = v_user
    and i.recipient_id = p_friend_user_id
    and i.status = 'pending';

  insert into public.lobby_invites(
    sender_id,
    recipient_id,
    room_id,
    status
  )
  values (
    v_user,
    p_friend_user_id,
    v_room.id,
    'pending'
  )
  returning * into v_invite;

  return query
  select v_invite.id, v_room.id, v_room.code;
end;
$function$;

revoke all on function public.invite_friend(uuid, uuid) from public, anon;
grant execute on function public.invite_friend(uuid, uuid) to authenticated;
