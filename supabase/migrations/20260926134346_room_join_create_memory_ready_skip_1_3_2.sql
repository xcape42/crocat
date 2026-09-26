-- Crocat 1.3.2 join-or-create rooms and Final Reveal ready skip.

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
as $$
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

    insert into public.room_players(room_id, user_id, display_name, role)
    values (v_room_id, v_user, v_host_name, 'HEAD');

    return query select v_room_id, v_code, 'HEAD'::text;
    return;
  end if;

  select rp.* into v_existing
  from public.room_players rp
  where rp.room_id = v_room.id
    and rp.user_id = v_user;

  if found then
    return query select v_room.id, v_room.code, v_existing.role;
    return;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room already started'; end if;

  select count(*) into v_count
  from public.room_players rp
  where rp.room_id = v_room.id;

  if v_count >= 2 then raise exception 'Room is full'; end if;

  insert into public.room_players(room_id, user_id, display_name, role)
  values (v_room.id, v_user, v_guest_name, 'BODY');

  return query select v_room.id, v_room.code, 'BODY'::text;
end;
$$;

revoke all on function private.join_or_create_room_impl(text,text,text,integer) from public;
grant execute on function private.join_or_create_room_impl(text,text,text,integer) to authenticated;

create or replace function public.join_or_create_room(
  p_code text,
  p_host_display_name text,
  p_guest_display_name text,
  p_round_seconds integer default 180
)
returns table(room_id uuid, room_code text, player_role text)
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select * from private.join_or_create_room_impl(
    p_code,
    p_host_display_name,
    p_guest_display_name,
    p_round_seconds
  );
$$;

revoke all on function public.join_or_create_room(text,text,text,integer) from public, anon;
grant execute on function public.join_or_create_room(text,text,text,integer) to authenticated;

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
  if v_user is null then raise exception 'Authentication required'; end if;

  update public.room_players rp
  set ready = coalesce(p_ready, false)
  from public.rooms r
  where rp.room_id = p_room_id
    and rp.user_id = v_user
    and r.id = rp.room_id
    and (
      (r.status = 'waiting' and r.host_id <> v_user)
      or r.status in ('final_reveal','reveal')
    );

  if not found then
    raise exception 'Ready state is unavailable for this player in the current phase';
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
  v_ready_count integer;
  v_new_round public.game_rounds%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room';
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then raise exception 'Room not found'; end if;

  select gr.* into v_round
  from public.game_rounds gr
  where gr.room_id = p_room_id
    and gr.status in ('adjusting','final_reveal','reveal')
  order by gr.started_at desc
  limit 1
  for update;

  if not found then return; end if;

  select count(*) into v_player_count
  from public.room_players rp
  where rp.room_id = p_room_id;

  if v_player_count < 2 then
    update public.game_rounds set status = 'finished' where id = v_round.id;
    update public.rooms set status = 'waiting', next_round_at = null where id = p_room_id;
    update public.room_players set ready = false where room_id = p_room_id;
    return;
  end if;

  if v_round.status = 'adjusting'
     and v_round.adjustment_ends_at is not null
     and now() >= v_round.adjustment_ends_at then
    update public.game_rounds set status = 'final_reveal' where id = v_round.id;
    update public.rooms set status = 'final_reveal' where id = p_room_id;
    update public.room_players set ready = false where room_id = p_room_id;
    v_round.status := 'final_reveal';
  end if;

  if v_round.status in ('final_reveal','reveal') then
    select count(*) into v_ready_count
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.ready is true;

    if v_ready_count >= 2
       or (
         v_round.final_reveal_ends_at is not null
         and now() >= v_round.final_reveal_ends_at
       ) then
      update public.game_rounds set status = 'finished' where id = v_round.id;

      insert into public.game_rounds(room_id, status, started_at, ends_at)
      values (
        p_room_id,
        'drawing',
        now(),
        now() + make_interval(secs => v_room.round_seconds)
      )
      returning * into v_new_round;

      update public.rooms set status = 'drawing', next_round_at = null where id = p_room_id;
      update public.room_players set ready = false where room_id = p_room_id;

      return next v_new_round;
    end if;
  end if;
end;
$$;
