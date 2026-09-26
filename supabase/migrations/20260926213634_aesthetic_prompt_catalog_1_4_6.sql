-- Crocat 1.4.6: curated aesthetic prompt catalog and semantic part labels.

alter table private.drawing_prompts
  add column if not exists head_label text,
  add column if not exists body_label text;

delete from private.drawing_prompts;

insert into private.drawing_prompts(theme, term, head_label, body_label)
values
('Mystisch', 'Wahrsagerkugel', 'Kugel', 'Ständer'),
('Mystisch', 'Schneekugel', 'Kugel', 'Sockel'),
('Mystisch', 'Zaubertrank', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Mondlaterne', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Kristalllampe', 'Kristall', 'Sockel'),
('Mystisch', 'Räucherschale', 'Rauch', 'Schale'),
('Mystisch', 'Magische Kerze', 'Flamme', 'Kerze'),
('Mystisch', 'Mystischer Spiegel', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Traumfänger', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Hexenkessel', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Sternenlaterne', 'Oberer Teil', 'Unterer Teil'),
('Mystisch', 'Zauberbuch auf Podest', 'Buch', 'Podest'),
('Fantasy', 'Fee', 'Kopf', 'Körper'),
('Fantasy', 'Hexe', 'Kopf', 'Körper'),
('Fantasy', 'Elfe', 'Kopf', 'Körper'),
('Fantasy', 'Zauberin', 'Kopf', 'Körper'),
('Fantasy', 'Sternenmagier', 'Kopf', 'Körper'),
('Fantasy', 'Mondprinzessin', 'Kopf', 'Körper'),
('Fantasy', 'Pilzgeist', 'Kopf', 'Körper'),
('Fantasy', 'Wolkenwesen', 'Kopf', 'Körper'),
('Fantasy', 'Meerjungfrau', 'Kopf', 'Körper'),
('Fantasy', 'Waldgeist', 'Kopf', 'Körper'),
('Fantasy', 'Drache', 'Kopf', 'Körper'),
('Fantasy', 'Phönix', 'Kopf', 'Körper'),
('Natur', 'Bonsai', 'Pflanze', 'Topf'),
('Natur', 'Kaktus im Topf', 'Pflanze', 'Topf'),
('Natur', 'Sonnenblume', 'Blüte', 'Stiel'),
('Natur', 'Lotusblume', 'Blüte', 'Stiel'),
('Natur', 'Pilz', 'Hut', 'Stiel'),
('Natur', 'Palme im Topf', 'Pflanze', 'Topf'),
('Natur', 'Rose in Vase', 'Blüte', 'Vase'),
('Natur', 'Lavendel im Topf', 'Pflanze', 'Topf'),
('Natur', 'Orchidee im Topf', 'Pflanze', 'Topf'),
('Natur', 'Monstera im Topf', 'Pflanze', 'Topf'),
('Natur', 'Farn im Topf', 'Pflanze', 'Topf'),
('Natur', 'Seerose', 'Blüte', 'Blatt'),
('Elegant', 'Parfümflakon', 'Verschluss', 'Flakon'),
('Elegant', 'Champagnerglas', 'Oberer Teil', 'Unterer Teil'),
('Elegant', 'Kerzenständer', 'Kerze', 'Ständer'),
('Elegant', 'Schmuckständer', 'Schmuck', 'Ständer'),
('Elegant', 'Dekorativer Spiegel', 'Oberer Teil', 'Unterer Teil'),
('Elegant', 'Elegante Lampe', 'Lampenschirm', 'Fuß'),
('Elegant', 'Vase', 'Oberer Teil', 'Unterer Teil'),
('Elegant', 'Statue auf Sockel', 'Statue', 'Sockel'),
('Elegant', 'Grammophon', 'Trichter', 'Gehäuse'),
('Elegant', 'Sanduhr', 'Oberer Teil', 'Unterer Teil'),
('Elegant', 'Pokal', 'Schale', 'Sockel'),
('Elegant', 'Schmuckschatulle', 'Deckel', 'Unterteil'),
('Genuss', 'Burger', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Sushi', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Cupcake', 'Topping', 'Förmchen'),
('Genuss', 'Eisbecher', 'Eis', 'Becher'),
('Genuss', 'Cocktail', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Macaron', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Donut', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Torte', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Pancake-Stapel', 'Topping', 'Stapel'),
('Genuss', 'Bubble Tea', 'Oberer Teil', 'Unterer Teil'),
('Genuss', 'Ramen-Schale', 'Topping', 'Schale'),
('Genuss', 'Teetasse', 'Tasse', 'Untertasse');

alter table private.drawing_prompts
  alter column head_label set not null,
  alter column body_label set not null;

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
    select picked.theme, picked.term, picked.head_label, picked.body_label
    from chosen_themes ct
    cross join lateral (
      select dp.theme, dp.term, dp.head_label, dp.body_label
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
        'bodyLabel', body_label
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
    select picked.theme, picked.term, picked.head_label, picked.body_label
    from chosen_themes ct
    cross join lateral (
      select dp.theme, dp.term, dp.head_label, dp.body_label
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
      'bodyLabel', body_label
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
