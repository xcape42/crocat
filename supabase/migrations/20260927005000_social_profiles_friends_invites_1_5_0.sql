-- Crocat 1.5.0: persistent player profiles, friendships, lobby invites and shared presence.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  friend_code text not null unique check (friend_code ~ '^[A-Z0-9]{8}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 18),
  color_key text not null default 'moss'
    check (color_key in ('moss','lime','coral','blue','violet','peach','mint')),
  avatar_key text not null default 'round'
    check (avatar_key in ('round','ears','spiky')),
  theme_key text not null default 'paper'
    check (theme_key in ('paper','ink')),
  symbol_key text not null default 'star'
    check (symbol_key in ('star','spark','heart','moon','bolt')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (user_a <> user_b),
  check (requested_by = user_a or requested_by = user_b),
  unique (user_a, user_b)
);

create table public.lobby_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  check (sender_id <> recipient_id)
);

create unique index lobby_invites_pending_pair_room_idx
  on public.lobby_invites(sender_id, recipient_id, room_id)
  where status = 'pending';

create index profiles_last_seen_idx
  on public.profiles(last_seen_at);

create index friendships_user_a_idx
  on public.friendships(user_a);

create index friendships_user_b_idx
  on public.friendships(user_b);

create index lobby_invites_recipient_status_idx
  on public.lobby_invites(recipient_id, status, created_at desc);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.lobby_invites enable row level security;

create policy profiles_visible_to_self_and_friends
on public.profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_a = (select auth.uid()) and f.user_b = profiles.user_id)
        or (f.user_b = (select auth.uid()) and f.user_a = profiles.user_id)
      )
  )
);

create policy friendships_visible_to_members
on public.friendships
for select
to authenticated
using (
  user_a = (select auth.uid())
  or user_b = (select auth.uid())
);

create policy lobby_invites_visible_to_members
on public.lobby_invites
for select
to authenticated
using (
  sender_id = (select auth.uid())
  or recipient_id = (select auth.uid())
);

revoke all on table
  public.profiles,
  public.friendships,
  public.lobby_invites
from public, anon;

grant select on table
  public.profiles,
  public.friendships,
  public.lobby_invites
to authenticated;

create or replace function private.make_friend_code()
returns text
language sql
set search_path = pg_catalog
as $function$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$function$;

revoke all on function private.make_friend_code() from public;

create or replace function private.normalized_friend_pair(
  p_left uuid,
  p_right uuid,
  out user_a uuid,
  out user_b uuid
)
language plpgsql
immutable
set search_path = pg_catalog
as $function$
begin
  if p_left::text < p_right::text then
    user_a := p_left;
    user_b := p_right;
  else
    user_a := p_right;
    user_b := p_left;
  end if;
end;
$function$;

revoke all on function private.normalized_friend_pair(uuid,uuid) from public;

create or replace function private.ensure_profile_impl(
  p_default_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_code text;
  v_name text := btrim(coalesce(p_default_name, ''));
  v_try integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.user_id = v_user;

  if found then
    update public.profiles p
    set last_seen_at = now()
    where p.user_id = v_user
    returning p.* into v_profile;

    return v_profile;
  end if;

  loop
    v_try := v_try + 1;
    v_code := private.make_friend_code();

    exit when not exists (
      select 1 from public.profiles p where p.friend_code = v_code
    );

    if v_try >= 12 then
      raise exception 'Could not allocate a friend code';
    end if;
  end loop;

  if char_length(v_name) not between 2 and 18 then
    v_name := 'Crocat ' || right(v_code, 4);
  end if;

  insert into public.profiles(
    user_id,
    friend_code,
    display_name,
    color_key,
    avatar_key,
    theme_key,
    symbol_key
  )
  values (
    v_user,
    v_code,
    v_name,
    'moss',
    'round',
    'paper',
    'star'
  )
  returning * into v_profile;

  return v_profile;
end;
$function$;

revoke all on function private.ensure_profile_impl(text) from public;

create or replace function public.ensure_profile(
  p_default_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
begin
  return private.ensure_profile_impl(p_default_name);
end;
$function$;

revoke all on function public.ensure_profile(text) from public, anon;
grant execute on function public.ensure_profile(text) to authenticated;

create or replace function public.update_profile(
  p_display_name text,
  p_color_key text,
  p_avatar_key text,
  p_theme_key text,
  p_symbol_key text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if char_length(v_name) not between 2 and 18 then
    raise exception 'Name must be 2-18 characters';
  end if;

  if p_color_key not in ('moss','lime','coral','blue','violet','peach','mint') then
    raise exception 'Invalid profile color';
  end if;

  if p_avatar_key not in ('round','ears','spiky') then
    raise exception 'Invalid avatar';
  end if;

  if p_theme_key not in ('paper','ink') then
    raise exception 'Invalid profile theme';
  end if;

  if p_symbol_key not in ('star','spark','heart','moon','bolt') then
    raise exception 'Invalid profile symbol';
  end if;

  perform private.ensure_profile_impl(v_name);

  update public.profiles p
  set display_name = v_name,
      color_key = p_color_key,
      avatar_key = p_avatar_key,
      theme_key = p_theme_key,
      symbol_key = p_symbol_key,
      last_seen_at = now(),
      updated_at = now()
  where p.user_id = v_user
  returning p.* into v_profile;

  update public.room_players rp
  set display_name = v_name
  where rp.user_id = v_user;

  return v_profile;
end;
$function$;

revoke all on function public.update_profile(text,text,text,text,text) from public, anon;
grant execute on function public.update_profile(text,text,text,text,text) to authenticated;

create or replace function public.touch_profile_presence()
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

  perform private.ensure_profile_impl(null);

  update public.profiles p
  set last_seen_at = now()
  where p.user_id = v_user;
end;
$function$;

revoke all on function public.touch_profile_presence() from public, anon;
grant execute on function public.touch_profile_presence() to authenticated;

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

  update public.room_players rp
  set last_seen_at = now()
  where rp.room_id = p_room_id
    and rp.user_id = v_user;

  if not found then
    raise exception 'You are not a member of this room';
  end if;

  perform private.ensure_profile_impl(null);

  update public.profiles p
  set last_seen_at = now()
  where p.user_id = v_user;
end;
$function$;

create or replace function private.are_friends(
  p_a uuid,
  p_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_a = p_a and f.user_b = p_b)
        or (f.user_a = p_b and f.user_b = p_a)
      )
  );
$function$;

revoke all on function private.are_friends(uuid,uuid) from public;

create or replace function public.send_friend_request(
  p_friend_code text
)
returns public.friendships
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_a uuid;
  v_b uuid;
  v_existing public.friendships%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  perform private.ensure_profile_impl(null);

  select p.user_id into v_target
  from public.profiles p
  where p.friend_code = upper(btrim(p_friend_code));

  if v_target is null then
    raise exception 'Friend code not found';
  end if;

  if v_target = v_user then
    raise exception 'You cannot add yourself';
  end if;

  select n.user_a, n.user_b
  into v_a, v_b
  from private.normalized_friend_pair(v_user, v_target) n;

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

revoke all on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.respond_friend_request(
  p_friendship_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_row public.friendships%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select f.* into v_row
  from public.friendships f
  where f.id = p_friendship_id
  for update;

  if not found
     or v_row.status <> 'pending'
     or v_row.requested_by = v_user
     or not (v_row.user_a = v_user or v_row.user_b = v_user) then
    raise exception 'Friend request is unavailable';
  end if;

  if coalesce(p_accept, false) then
    update public.friendships f
    set status = 'accepted',
        responded_at = now()
    where f.id = p_friendship_id;
  else
    delete from public.friendships f
    where f.id = p_friendship_id;
  end if;
end;
$function$;

revoke all on function public.respond_friend_request(uuid,boolean) from public, anon;
grant execute on function public.respond_friend_request(uuid,boolean) to authenticated;

create or replace function public.remove_friend(
  p_friend_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_friend_user_id is null or p_friend_user_id = v_user then
    raise exception 'Invalid friend';
  end if;

  select n.user_a, n.user_b
  into v_a, v_b
  from private.normalized_friend_pair(v_user, p_friend_user_id) n;

  delete from public.friendships f
  where f.user_a = v_a
    and f.user_b = v_b;

  update public.lobby_invites i
  set status = 'declined',
      responded_at = now()
  where i.status = 'pending'
    and (
      (i.sender_id = v_user and i.recipient_id = p_friend_user_id)
      or (i.sender_id = p_friend_user_id and i.recipient_id = v_user)
    );
end;
$function$;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated;

create or replace function public.list_friends()
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
  open_room_code text
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
    )
  from accepted af
  join public.profiles p
    on p.user_id = af.friend_id
  left join activity a
    on a.user_id = p.user_id
  order by p.display_name, p.user_id;
end;
$function$;

revoke all on function public.list_friends() from public, anon;
grant execute on function public.list_friends() to authenticated;

create or replace function public.list_friend_requests()
returns table(
  friendship_id uuid,
  other_user_id uuid,
  direction text,
  display_name text,
  friend_code text,
  color_key text,
  avatar_key text,
  theme_key text,
  symbol_key text,
  created_at timestamptz
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
  select
    f.id,
    p.user_id,
    case
      when f.requested_by = v_user then 'outgoing'
      else 'incoming'
    end,
    p.display_name,
    p.friend_code,
    p.color_key,
    p.avatar_key,
    p.theme_key,
    p.symbol_key,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.user_id = case
      when f.user_a = v_user then f.user_b
      else f.user_a
    end
  where f.status = 'pending'
    and (f.user_a = v_user or f.user_b = v_user)
  order by f.created_at desc;
end;
$function$;

revoke all on function public.list_friend_requests() from public, anon;
grant execute on function public.list_friend_requests() to authenticated;

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

revoke all on function public.invite_friend(uuid,uuid) from public, anon;
grant execute on function public.invite_friend(uuid,uuid) to authenticated;

create or replace function public.list_lobby_invites()
returns table(
  invite_id uuid,
  sender_user_id uuid,
  room_id uuid,
  room_code text,
  display_name text,
  color_key text,
  avatar_key text,
  theme_key text,
  symbol_key text,
  created_at timestamptz,
  expires_at timestamptz
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
  select
    i.id,
    i.sender_id,
    i.room_id,
    r.code,
    p.display_name,
    p.color_key,
    p.avatar_key,
    p.theme_key,
    p.symbol_key,
    i.created_at,
    i.expires_at
  from public.lobby_invites i
  join public.rooms r
    on r.id = i.room_id
  join public.profiles p
    on p.user_id = i.sender_id
  where i.recipient_id = v_user
    and i.status = 'pending'
    and i.expires_at > now()
    and r.status = 'waiting'
    and (
      select count(*)
      from public.room_players rp
      where rp.room_id = r.id
    ) < 2
  order by i.created_at desc;
end;
$function$;

revoke all on function public.list_lobby_invites() from public, anon;
grant execute on function public.list_lobby_invites() to authenticated;

create or replace function public.accept_lobby_invite(
  p_invite_id uuid
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
  v_invite public.lobby_invites%rowtype;
  v_room public.rooms%rowtype;
  v_profile public.profiles%rowtype;
  v_ticket record;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select i.* into v_invite
  from public.lobby_invites i
  where i.id = p_invite_id
  for update;

  if not found
     or v_invite.recipient_id <> v_user
     or v_invite.status <> 'pending'
     or v_invite.expires_at <= now() then
    raise exception 'Invite is unavailable';
  end if;

  if not private.are_friends(v_user, v_invite.sender_id) then
    raise exception 'Invite is no longer valid';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = v_invite.room_id
  for update;

  if not found
     or v_room.status <> 'waiting'
     or (
       select count(*)
       from public.room_players rp
       where rp.room_id = v_room.id
     ) >= 2 then
    raise exception 'Lobby is no longer open';
  end if;

  v_profile := private.ensure_profile_impl(null);

  select *
  into v_ticket
  from private.join_room_impl(v_room.code, v_profile.display_name)
  limit 1;

  update public.lobby_invites i
  set status = 'accepted',
      responded_at = now()
  where i.id = v_invite.id;

  update public.lobby_invites i
  set status = 'declined',
      responded_at = now()
  where i.recipient_id = v_user
    and i.status = 'pending'
    and i.id <> v_invite.id;

  return query
  select
    v_ticket.room_id,
    v_ticket.room_code,
    v_ticket.player_role;
end;
$function$;

revoke all on function public.accept_lobby_invite(uuid) from public, anon;
grant execute on function public.accept_lobby_invite(uuid) to authenticated;

create or replace function public.decline_lobby_invite(
  p_invite_id uuid
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

  update public.lobby_invites i
  set status = 'declined',
      responded_at = now()
  where i.id = p_invite_id
    and i.recipient_id = v_user
    and i.status = 'pending';

  if not found then
    raise exception 'Invite is unavailable';
  end if;
end;
$function$;

revoke all on function public.decline_lobby_invite(uuid) from public, anon;
grant execute on function public.decline_lobby_invite(uuid) to authenticated;

alter publication supabase_realtime
  add table public.profiles, public.friendships, public.lobby_invites;
