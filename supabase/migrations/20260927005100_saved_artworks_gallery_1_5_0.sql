-- Crocat 1.5.0: persistent private artwork gallery.

create table public.saved_artworks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_user_id uuid references auth.users(id) on delete set null,
  round_id uuid references public.game_rounds(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 60),
  prompt_term text,
  prompt_theme text,
  head_drawing jsonb not null,
  body_drawing jsonb not null,
  head_transform jsonb not null default '{"x":0,"y":0,"scale":1}'::jsonb,
  body_transform jsonb not null default '{"x":0,"y":0,"scale":1}'::jsonb,
  head_profile jsonb not null,
  body_profile jsonb not null,
  favorite boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index saved_artworks_owner_round_idx
  on public.saved_artworks(owner_id, round_id)
  where round_id is not null;

create index saved_artworks_owner_created_idx
  on public.saved_artworks(owner_id, created_at desc);

alter table public.saved_artworks enable row level security;

create policy saved_artworks_owner_select
on public.saved_artworks
for select
to authenticated
using (owner_id = (select auth.uid()));

revoke all on table public.saved_artworks from public, anon;
grant select on table public.saved_artworks to authenticated;

create or replace function private.profile_snapshot(
  p_user uuid,
  p_fallback_name text
)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select jsonb_build_object(
    'userId', p_user,
    'displayName', coalesce(p.display_name, p_fallback_name, 'Crocat'),
    'colorKey', coalesce(p.color_key, 'moss'),
    'avatarKey', coalesce(p.avatar_key, 'round'),
    'themeKey', coalesce(p.theme_key, 'paper'),
    'symbolKey', coalesce(p.symbol_key, 'star')
  )
  from (select 1) x
  left join public.profiles p
    on p.user_id = p_user;
$function$;

revoke all on function private.profile_snapshot(uuid,text) from public;

create or replace function private.generated_artwork_title(
  p_term text,
  p_round_id uuid,
  p_owner uuid
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_words text[] := array[
    'Coole',
    'Wilde',
    'Magische',
    'Freche',
    'Flauschige',
    'Glitzernde',
    'Seltsame'
  ];
  v_hash bigint := hashtext(p_round_id::text || p_owner::text)::bigint + 2147483648;
  v_word text;
  v_number integer;
  v_term text := btrim(coalesce(p_term, ''));
begin
  v_word := v_words[
    1 + mod(v_hash, array_length(v_words, 1))::integer
  ];

  v_number := 1 + mod(v_hash / 7, 99)::integer;

  if v_term = '' then
    v_term := 'Crocat';
  end if;

  return left(
    v_word || ' ' || initcap(v_term) || ' ' || v_number::text,
    60
  );
end;
$function$;

revoke all on function private.generated_artwork_title(text,uuid,uuid) from public;

create or replace function public.save_artwork(
  p_round_id uuid
)
returns public.saved_artworks
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_head public.submissions%rowtype;
  v_body public.submissions%rowtype;
  v_existing public.saved_artworks%rowtype;
  v_partner uuid;
  v_head_name text;
  v_body_name text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select a.* into v_existing
  from public.saved_artworks a
  where a.owner_id = v_user
    and a.round_id = p_round_id
  for update;

  if found then
    update public.saved_artworks a
    set favorite = true,
        updated_at = now()
    where a.id = v_existing.id
    returning a.* into v_existing;

    return v_existing;
  end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.id = p_round_id;

  if not found then
    raise exception 'Round not found';
  end if;

  if v_user <> v_round.head_player_id
     and v_user <> v_round.body_player_id then
    raise exception 'You did not participate in this artwork';
  end if;

  if v_round.status not in ('final_reveal', 'reveal', 'finished') then
    raise exception 'Artwork is not ready to save';
  end if;

  select s.* into v_head
  from public.submissions s
  where s.round_id = p_round_id
    and s.role = 'HEAD'
    and s.submitted is true
  order by s.created_at desc
  limit 1;

  select s.* into v_body
  from public.submissions s
  where s.round_id = p_round_id
    and s.role = 'BODY'
    and s.submitted is true
  order by s.created_at desc
  limit 1;

  if v_head.id is null or v_body.id is null then
    raise exception 'Artwork is incomplete';
  end if;

  v_partner := case
    when v_user = v_round.head_player_id
      then v_round.body_player_id
    else v_round.head_player_id
  end;

  select rp.display_name into v_head_name
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_round.head_player_id;

  select rp.display_name into v_body_name
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_round.body_player_id;

  insert into public.saved_artworks(
    owner_id,
    partner_user_id,
    round_id,
    title,
    prompt_term,
    prompt_theme,
    head_drawing,
    body_drawing,
    head_transform,
    body_transform,
    head_profile,
    body_profile,
    favorite
  )
  values (
    v_user,
    v_partner,
    p_round_id,
    private.generated_artwork_title(
      v_round.prompt_term,
      p_round_id,
      v_user
    ),
    v_round.prompt_term,
    v_round.prompt_theme,
    v_head.drawing,
    v_body.drawing,
    v_head.transform,
    v_body.transform,
    private.profile_snapshot(
      v_round.head_player_id,
      v_head_name
    ),
    private.profile_snapshot(
      v_round.body_player_id,
      v_body_name
    ),
    true
  )
  returning * into v_existing;

  return v_existing;
end;
$function$;

revoke all on function public.save_artwork(uuid) from public, anon;
grant execute on function public.save_artwork(uuid) to authenticated;

create or replace function public.rename_artwork(
  p_artwork_id uuid,
  p_title text
)
returns public.saved_artworks
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_row public.saved_artworks%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if char_length(v_title) not between 2 and 60 then
    raise exception 'Title must be 2-60 characters';
  end if;

  update public.saved_artworks a
  set title = v_title,
      updated_at = now()
  where a.id = p_artwork_id
    and a.owner_id = v_user
  returning a.* into v_row;

  if not found then
    raise exception 'Artwork not found';
  end if;

  return v_row;
end;
$function$;

revoke all on function public.rename_artwork(uuid,text) from public, anon;
grant execute on function public.rename_artwork(uuid,text) to authenticated;

create or replace function public.set_artwork_favorite(
  p_artwork_id uuid,
  p_favorite boolean
)
returns public.saved_artworks
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_row public.saved_artworks%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.saved_artworks a
  set favorite = coalesce(p_favorite, false),
      updated_at = now()
  where a.id = p_artwork_id
    and a.owner_id = v_user
  returning a.* into v_row;

  if not found then
    raise exception 'Artwork not found';
  end if;

  return v_row;
end;
$function$;

revoke all on function public.set_artwork_favorite(uuid,boolean) from public, anon;
grant execute on function public.set_artwork_favorite(uuid,boolean) to authenticated;

create or replace function public.delete_artwork(
  p_artwork_id uuid
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

  delete from public.saved_artworks a
  where a.id = p_artwork_id
    and a.owner_id = v_user;

  if not found then
    raise exception 'Artwork not found';
  end if;
end;
$function$;

revoke all on function public.delete_artwork(uuid) from public, anon;
grant execute on function public.delete_artwork(uuid) to authenticated;
