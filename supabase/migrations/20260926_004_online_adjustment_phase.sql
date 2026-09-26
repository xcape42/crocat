-- Crocat 1.3.0 synchronized online adjustment phase.

alter table public.rooms
  drop constraint if exists rooms_status_check;

alter table public.rooms
  add constraint rooms_status_check
  check (status in ('waiting','drawing','adjusting','final_reveal','reveal','finished'));

alter table public.game_rounds
  drop constraint if exists game_rounds_status_check;

alter table public.game_rounds
  add constraint game_rounds_status_check
  check (status in ('drawing','adjusting','final_reveal','reveal','finished'));

alter table public.game_rounds
  add column if not exists adjustment_ends_at timestamptz,
  add column if not exists final_reveal_ends_at timestamptz;

alter table public.submissions
  add column if not exists transform jsonb not null
  default '{"x":0,"y":0,"scale":1}'::jsonb;

create or replace function private.set_ready_impl(
  p_room_id uuid,
  p_ready boolean
)
returns void
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

  update public.room_players rp
  set ready = coalesce(p_ready, false)
  from public.rooms r
  where rp.room_id = p_room_id
    and rp.user_id = v_user
    and r.id = rp.room_id
    and r.status = 'waiting';

  if not found then
    raise exception 'Ready check is unavailable for this room';
  end if;
end;
$$;

create or replace function private.submit_drawing_impl(
  p_round_id uuid,
  p_role text,
  p_drawing jsonb
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
  v_count integer;
  v_phase_started_at timestamptz;
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

  if v_round.status <> 'drawing' then
    raise exception 'Round is not accepting drawings';
  end if;

  select rp.* into v_player
  from public.room_players rp
  where rp.room_id = v_round.room_id
    and rp.user_id = v_user;

  if not found or v_player.role <> p_role then
    raise exception 'Role mismatch';
  end if;

  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    raise exception 'Invalid drawing payload';
  end if;

  insert into public.submissions(round_id, player_id, role, drawing, transform)
  values (
    p_round_id,
    v_user,
    p_role,
    p_drawing,
    '{"x":0,"y":0,"scale":1}'::jsonb
  )
  on conflict (round_id, player_id)
  do update set
    drawing = excluded.drawing,
    transform = '{"x":0,"y":0,"scale":1}'::jsonb,
    created_at = now();

  select count(*) into v_count
  from public.submissions s
  where s.round_id = p_round_id;

  if v_count >= 2 then
    v_phase_started_at := now();

    update public.game_rounds
    set status = 'adjusting',
        revealed_at = coalesce(revealed_at, v_phase_started_at),
        adjustment_ends_at = v_phase_started_at + interval '15 seconds',
        final_reveal_ends_at = v_phase_started_at + interval '30 seconds'
    where id = p_round_id;

    update public.rooms
    set status = 'adjusting',
        next_round_at = v_phase_started_at + interval '30 seconds'
    where id = v_round.room_id;

    update public.room_players
    set ready = false
    where room_id = v_round.room_id;
  end if;
end;
$$;

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
     or jsonb_typeof(p_transform->'x') <> 'number'
     or jsonb_typeof(p_transform->'y') <> 'number'
     or jsonb_typeof(p_transform->'scale') <> 'number' then
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

create or replace function private.advance_phase_impl(p_room_id uuid)
returns setof public.game_rounds
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_round public.game_rounds%rowtype;
  v_player_count integer;
  v_new_round public.game_rounds%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.room_id = p_room_id
    and gr.status in ('adjusting','final_reveal','reveal')
  order by gr.started_at desc
  limit 1
  for update;

  if not found then
    return;
  end if;

  select count(*) into v_player_count
  from public.room_players rp
  where rp.room_id = p_room_id;

  if v_player_count < 2 then
    update public.game_rounds
    set status = 'finished'
    where id = v_round.id;

    update public.rooms
    set status = 'waiting',
        next_round_at = null
    where id = p_room_id;

    update public.room_players
    set ready = false
    where room_id = p_room_id;

    return;
  end if;

  if v_round.status = 'adjusting'
     and v_round.adjustment_ends_at is not null
     and now() >= v_round.adjustment_ends_at then
    update public.game_rounds
    set status = 'final_reveal'
    where id = v_round.id;

    update public.rooms
    set status = 'final_reveal'
    where id = p_room_id;

    v_round.status := 'final_reveal';
  end if;

  if v_round.status in ('final_reveal','reveal')
     and v_round.final_reveal_ends_at is not null
     and now() >= v_round.final_reveal_ends_at then
    update public.game_rounds
    set status = 'finished'
    where id = v_round.id;

    insert into public.game_rounds(room_id, status, started_at, ends_at)
    values (
      p_room_id,
      'drawing',
      now(),
      now() + make_interval(secs => v_room.round_seconds)
    )
    returning * into v_new_round;

    update public.rooms
    set status = 'drawing',
        next_round_at = null
    where id = p_room_id;

    update public.room_players
    set ready = false
    where room_id = p_room_id;

    return next v_new_round;
  end if;
end;
$$;

create or replace function private.leave_room_impl(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    return;
  end if;

  if not private.is_room_member(p_room_id) then
    return;
  end if;

  if v_room.host_id = v_user then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  delete from public.room_players
  where room_id = p_room_id
    and user_id = v_user;

  update public.game_rounds
  set status = 'finished'
  where room_id = p_room_id
    and status in ('drawing','adjusting','final_reveal','reveal');

  update public.rooms
  set status = 'waiting',
      next_round_at = null
  where id = p_room_id;

  update public.room_players
  set ready = false
  where room_id = p_room_id;
end;
$$;

revoke all on function private.save_transform_impl(uuid, text, jsonb) from public;
revoke all on function private.advance_phase_impl(uuid) from public;
grant execute on function private.save_transform_impl(uuid, text, jsonb) to authenticated;
grant execute on function private.advance_phase_impl(uuid) to authenticated;

create or replace function public.save_transform(
  p_round_id uuid,
  p_role text,
  p_transform jsonb
)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.save_transform_impl(p_round_id, p_role, p_transform);
$$;

create or replace function public.advance_phase(p_room_id uuid)
returns setof public.game_rounds
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.advance_phase_impl(p_room_id);
$$;

revoke all on function public.save_transform(uuid, text, jsonb) from public, anon;
revoke all on function public.advance_phase(uuid) from public, anon;
grant execute on function public.save_transform(uuid, text, jsonb) to authenticated;
grant execute on function public.advance_phase(uuid) to authenticated;
