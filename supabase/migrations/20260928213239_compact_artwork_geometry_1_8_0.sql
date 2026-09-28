-- Crocat 1.8.0: compact 3:4 artwork geometry and curated connection guides.

alter table private.drawing_prompts
  add column if not exists guide_mode text;

update private.drawing_prompts
set guide_mode = case
  when term = any(array[
    'Wahrsagerkugel','Schneekugel','Kristalllampe','Magische Kerze','Zauberbuch auf Podest',
    'Fee','Hexe','Elfe','Zauberin','Sternenmagier','Mondprinzessin','Pilzgeist','Wolkenwesen','Meerjungfrau','Waldgeist','Drache','Phönix',
    'Bonsai','Kaktus im Topf','Sonnenblume','Lotusblume','Pilz','Palme im Topf','Rose in Vase','Lavendel im Topf','Orchidee im Topf','Monstera im Topf','Farn im Topf',
    'Parfümflakon','Kerzenständer','Elegante Lampe','Statue auf Sockel','Grammophon','Pokal','Schmuckschatulle',
    'Cupcake','Eisbecher','Teetasse'
  ]) then 'hard'
  when term = any(array['Sushi','Macaron','Donut']) then 'none'
  else 'soft'
end;

alter table private.drawing_prompts
  alter column guide_mode set default 'soft',
  alter column guide_mode set not null;

alter table private.drawing_prompts
  drop constraint if exists drawing_prompts_guide_mode_check;

alter table private.drawing_prompts
  add constraint drawing_prompts_guide_mode_check
  check (guide_mode in ('hard','soft','none'));

create or replace function private.random_prompt_options()
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $function$
  with chosen_themes as (
    select theme
    from private.drawing_prompts
    group by theme
    order by random()
    limit 3
  ),
  chosen as (
    select picked.theme, picked.term, picked.head_label, picked.body_label, picked.guide_mode
    from chosen_themes ct
    cross join lateral (
      select dp.theme, dp.term, dp.head_label, dp.body_label, dp.guide_mode
      from private.drawing_prompts dp
      where dp.theme = ct.theme
      order by random()
      limit 1
    ) picked
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'theme', theme,
        'term', term,
        'headLabel', head_label,
        'bodyLabel', body_label,
        'guideMode', guide_mode
      )
    ),
    '[]'::jsonb
  )
  from chosen;
$function$;

create or replace function private.reroll_prompt_impl(p_round_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
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
    select picked.theme, picked.term, picked.head_label, picked.body_label, picked.guide_mode
    from chosen_themes ct
    cross join lateral (
      select dp.theme, dp.term, dp.head_label, dp.body_label, dp.guide_mode
      from private.drawing_prompts dp
      where dp.theme = ct.theme
        and dp.term not in (select term from old_terms)
      order by random()
      limit 1
    ) picked
  )
  select jsonb_agg(
    jsonb_build_object(
      'theme', theme,
      'term', term,
      'headLabel', head_label,
      'bodyLabel', body_label,
      'guideMode', guide_mode
    )
  )
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

alter table public.saved_artworks
  add column if not exists geometry_version smallint;

update public.saved_artworks
set geometry_version = 1
where geometry_version is null;

alter table public.saved_artworks
  alter column geometry_version set default 1,
  alter column geometry_version set not null;

alter table public.saved_artworks
  drop constraint if exists saved_artworks_geometry_version_check;

alter table public.saved_artworks
  add constraint saved_artworks_geometry_version_check
  check (geometry_version in (1, 2));

drop function if exists public.save_artwork(uuid);

create function public.save_artwork(
  p_round_id uuid,
  p_geometry_version smallint default 1
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

  if p_geometry_version not in (1, 2) then
    raise exception 'Unsupported artwork geometry version';
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
    favorite,
    geometry_version
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
    true,
    p_geometry_version
  )
  returning * into v_existing;

  return v_existing;
end;
$function$;

revoke all on function public.save_artwork(uuid,smallint) from public, anon;
grant execute on function public.save_artwork(uuid,smallint) to authenticated;
