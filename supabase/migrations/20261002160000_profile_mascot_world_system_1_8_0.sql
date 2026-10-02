-- Crocat 1.8.0: separate personal mascot identity from Crocat Worlds.

alter table public.profiles
  add column if not exists mascot_character_key text not null default 'gentle';

alter table public.profiles
  drop constraint if exists profiles_mascot_character_key_check;

alter table public.profiles
  add constraint profiles_mascot_character_key_check
  check (mascot_character_key = any (array[
    'gentle'::text,
    'dreamy'::text,
    'playful'::text
  ]));

-- Preserve the personality users were already seeing as their initial independent mascot character.
update public.profiles
set mascot_character_key = case
  when theme_key in ('moon', 'ink') then 'dreamy'
  when theme_key = 'candy' then 'playful'
  else 'gentle'
end;

alter table public.profiles
  drop constraint if exists profiles_theme_key_check;

alter table public.profiles
  add constraint profiles_theme_key_check
  check (theme_key = any (array[
    'paper'::text,
    'ink'::text,
    'moss'::text,
    'moon'::text,
    'candy'::text,
    'halo'::text,
    'ember'::text
  ]));

-- Keep the legacy 5-argument update_profile overload for already-loaded clients.
create or replace function public.update_profile(
  p_display_name text,
  p_color_key text,
  p_avatar_key text,
  p_theme_key text,
  p_symbol_key text,
  p_mascot_character_key text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
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
    raise exception 'Invalid mascot shape';
  end if;

  if p_mascot_character_key not in ('gentle','dreamy','playful') then
    raise exception 'Invalid mascot character';
  end if;

  if p_theme_key not in ('paper','ink','moss','moon','candy','halo','ember') then
    raise exception 'Invalid profile theme';
  end if;

  if p_symbol_key not in ('star','spark','heart','moon','bolt') then
    raise exception 'Invalid mascot symbol';
  end if;

  perform private.ensure_profile_impl(v_name);

  update public.profiles p
  set display_name = v_name,
      color_key = p_color_key,
      avatar_key = p_avatar_key,
      mascot_character_key = p_mascot_character_key,
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
$$;

revoke all on function public.update_profile(text,text,text,text,text,text) from public, anon;
grant execute on function public.update_profile(text,text,text,text,text,text) to authenticated, service_role;

create or replace function private.profile_snapshot(
  p_user uuid,
  p_fallback_name text
)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'userId', p_user,
    'displayName', coalesce(p.display_name, p_fallback_name, 'Crocat'),
    'colorKey', coalesce(p.color_key, 'moss'),
    'avatarKey', coalesce(p.avatar_key, 'round'),
    'mascotCharacterKey', coalesce(p.mascot_character_key, 'gentle'),
    'themeKey', coalesce(p.theme_key, 'paper'),
    'symbolKey', coalesce(p.symbol_key, 'star')
  )
  from (select 1) x
  left join public.profiles p
    on p.user_id = p_user;
$$;

revoke all on function private.profile_snapshot(uuid,text) from public, anon, authenticated, service_role;
grant execute on function private.profile_snapshot(uuid,text) to postgres;

drop function if exists public.list_friend_requests();
create function public.list_friend_requests()
returns table(
  friendship_id uuid,
  other_user_id uuid,
  direction text,
  display_name text,
  friend_code text,
  color_key text,
  avatar_key text,
  mascot_character_key text,
  theme_key text,
  symbol_key text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
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
    case when f.requested_by = v_user then 'outgoing' else 'incoming' end,
    p.display_name,
    p.friend_code,
    p.color_key,
    p.avatar_key,
    p.mascot_character_key,
    p.theme_key,
    p.symbol_key,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.user_id = case when f.user_a = v_user then f.user_b else f.user_a end
  where f.status = 'pending'
    and (f.user_a = v_user or f.user_b = v_user)
  order by f.created_at desc;
end;
$$;

revoke all on function public.list_friend_requests() from public, anon;
grant execute on function public.list_friend_requests() to authenticated, service_role;

drop function if exists public.list_friends();
create function public.list_friends()
returns table(
  friend_user_id uuid,
  display_name text,
  friend_code text,
  color_key text,
  avatar_key text,
  mascot_character_key text,
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
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  return query
  with accepted as (
    select case when f.user_a = v_user then f.user_b else f.user_a end as friend_id
    from public.friendships f
    where f.status = 'accepted'
      and (f.user_a = v_user or f.user_b = v_user)
  ),
  activity as (
    select rp.user_id, max(rp.last_seen_at) as room_last_seen
    from public.room_players rp
    group by rp.user_id
  )
  select
    p.user_id,
    p.display_name,
    p.friend_code,
    p.color_key,
    p.avatar_key,
    p.mascot_character_key,
    p.theme_key,
    p.symbol_key,
    greatest(p.last_seen_at, coalesce(a.room_last_seen, p.last_seen_at)),
    greatest(p.last_seen_at, coalesce(a.room_last_seen, p.last_seen_at)) >= now() - interval '45 seconds',
    (
      select r.code
      from public.rooms r
      join public.room_players rp2 on rp2.room_id = r.id
      where rp2.user_id = p.user_id
        and r.status = 'waiting'
        and (
          select count(*) from public.room_players x where x.room_id = r.id
        ) < 2
      order by r.created_at desc
      limit 1
    ),
    progress.friend_level,
    progress.shared_rounds,
    progress.friendship_label
  from accepted af
  join public.profiles p on p.user_id = af.friend_id
  left join activity a on a.user_id = p.user_id
  cross join lateral private.friendship_progress(v_user, p.user_id) progress
  order by
    (greatest(p.last_seen_at, coalesce(a.room_last_seen, p.last_seen_at)) >= now() - interval '45 seconds') desc,
    p.display_name,
    p.user_id;
end;
$$;

revoke all on function public.list_friends() from public, anon;
grant execute on function public.list_friends() to authenticated, service_role;

drop function if exists public.list_lobby_invites();
create function public.list_lobby_invites()
returns table(
  invite_id uuid,
  sender_user_id uuid,
  room_id uuid,
  room_code text,
  display_name text,
  color_key text,
  avatar_key text,
  mascot_character_key text,
  theme_key text,
  symbol_key text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
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
    p.mascot_character_key,
    p.theme_key,
    p.symbol_key,
    i.created_at,
    i.expires_at
  from public.lobby_invites i
  join public.rooms r on r.id = i.room_id
  join public.profiles p on p.user_id = i.sender_id
  where i.recipient_id = v_user
    and i.status = 'pending'
    and i.expires_at > now()
    and r.status = 'waiting'
    and (
      select count(*) from public.room_players rp where rp.room_id = r.id
    ) < 2
  order by i.created_at desc;
end;
$$;

revoke all on function public.list_lobby_invites() from public, anon;
grant execute on function public.list_lobby_invites() to authenticated, service_role;
