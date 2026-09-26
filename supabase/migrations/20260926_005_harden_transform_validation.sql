create or replace function private.save_transform_impl(
  p_round_id uuid,
  p_role text,
  p_transform jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_round public.game_rounds%rowtype;
  v_player public.room_players%rowtype;
  v_x numeric;
  v_y numeric;
  v_scale numeric;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.id = p_round_id
  for update;

  if not found then
    raise exception 'Round not found';
  end if;

  if v_round.status not in ('adjusting','final_reveal')
     or v_round.adjustment_ends_at is null
     or now() > v_round.adjustment_ends_at + interval '2 seconds' then
    raise exception 'Adjustment phase is closed';
  end if;

  select rp.* into v_player
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_user;

  if not found or v_player.role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_transform is null
     or jsonb_typeof(p_transform) <> 'object'
     or coalesce(jsonb_typeof(p_transform->'x'), '') <> 'number'
     or coalesce(jsonb_typeof(p_transform->'y'), '') <> 'number'
     or coalesce(jsonb_typeof(p_transform->'scale'), '') <> 'number' then
    raise exception 'Invalid transform payload';
  end if;

  v_x := (p_transform->>'x')::numeric;
  v_y := (p_transform->>'y')::numeric;
  v_scale := (p_transform->>'scale')::numeric;

  if v_x < -360 or v_x > 360
     or v_y < -760 or v_y > 760
     or v_scale < 0.75 or v_scale > 1.30 then
    raise exception 'Transform outside allowed range';
  end if;

  update public.submissions s
  set transform = jsonb_build_object(
    'x', v_x,
    'y', v_y,
    'scale', v_scale
  )
  where s.round_id = p_round_id
    and s.player_id = v_user
    and s.role = p_role;

  if not found then
    raise exception 'Submission not found';
  end if;
end;
$$;