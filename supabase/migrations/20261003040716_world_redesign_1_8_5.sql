-- Crocat 1.8.5: redesign current Worlds and add Royal Gem.
-- Keep the existing ember key for Vampire Blood so saved profiles remain compatible.

alter table public.profiles
  drop constraint if exists profiles_color_key_check;

alter table public.profiles
  add constraint profiles_color_key_check
  check (color_key = any (array[
    'moss'::text,
    'lime'::text,
    'coral'::text,
    'blue'::text,
    'violet'::text,
    'peach'::text,
    'mint'::text,
    'halo'::text,
    'ember'::text,
    'shadow'::text,
    'royal'::text
  ]));

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
    'ember'::text,
    'shadow'::text,
    'royal'::text
  ]));

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

  if p_color_key not in ('moss','lime','coral','blue','violet','peach','mint','halo','ember','shadow','royal') then
    raise exception 'Invalid profile color';
  end if;

  if p_avatar_key not in ('round','ears','spiky','slim','angular') then
    raise exception 'Invalid mascot shape';
  end if;

  if p_mascot_character_key not in ('gentle','dreamy','playful','sunny','cool') then
    raise exception 'Invalid mascot character';
  end if;

  if p_theme_key not in ('paper','ink','moss','moon','candy','halo','ember','shadow','royal') then
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
