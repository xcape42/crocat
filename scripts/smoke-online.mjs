import { createClient } from '@supabase/supabase-js';

const url = 'https://ufryvzzzegoltrwcpkls.supabase.co';
const key = 'sb_publishable_aeZDV23ZRp855C9bKmRlCw_F9NpihWS';

function client() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function guest(name) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: name, crocat_smoke_test: true } },
  });
  if (error) throw new Error(`${name} anonymous auth failed: ${error.message}`);
  if (!data.user) throw new Error(`${name} anonymous auth returned no user`);
  return { supabase, user: data.user };
}

const first = (data) => Array.isArray(data) ? data[0] : data;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForRealtimeJoin(domi, roomId, sarahUserId) {
  let resolveJoin;
  let rejectJoin;
  const joined = new Promise((resolve, reject) => {
    resolveJoin = resolve;
    rejectJoin = reject;
  });

  const channel = domi
    .channel(`smoke-room:${roomId}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      (payload) => {
        if (payload.new?.user_id === sarahUserId) resolveJoin();
      },
    );

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Host realtime subscription timed out')), 10000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(`Host realtime channel failed: ${status}`));
      }
    });
  });

  const timeout = setTimeout(() => rejectJoin(new Error('Host did not receive Sarah room_players INSERT')), 10000);

  return {
    joined: joined.finally(() => clearTimeout(timeout)),
    close: () => domi.removeChannel(channel),
  };
}

async function submitPair(domi, sarah, roundId, suffix) {
  const head = {
    id: `smoke-head-${suffix}`,
    strokes: [{ id: `h-${suffix}`, points: [{ x: 20, y: 20 }, { x: 40, y: 40 }], color: '#17221D', width: 6, opacity: 1 }],
  };
  const body = {
    id: `smoke-body-${suffix}`,
    strokes: [{ id: `b-${suffix}`, points: [{ x: 20, y: 40 }, { x: 40, y: 80 }], color: '#17221D', width: 6, opacity: 1 }],
  };

  const headResult = await domi.rpc('submit_drawing', {
    p_round_id: roundId, p_role: 'HEAD', p_drawing: head,
  });
  if (headResult.error) throw headResult.error;

  const bodyResult = await sarah.rpc('submit_drawing', {
    p_round_id: roundId, p_role: 'BODY', p_drawing: body,
  });
  if (bodyResult.error) throw bodyResult.error;
}

async function main() {
  const { supabase: domi } = await guest('Domi');
  const { supabase: sarah, user: sarahUser } = await guest('Sarah');

  const created = await domi.rpc('create_room', {
    p_display_name: 'Domi',
    p_round_seconds: 30,
  });
  if (created.error) throw created.error;
  const room = first(created.data);
  if (!room?.room_id || !room?.room_code || room.player_role !== 'HEAD') {
    throw new Error('create_room returned an invalid room ticket');
  }

  const hostRealtime = await waitForRealtimeJoin(domi, room.room_id, sarahUser.id);

  const joined = await sarah.rpc('join_room', {
    p_code: room.room_code,
    p_display_name: 'Sarah',
  });
  if (joined.error) throw joined.error;
  if (first(joined.data)?.player_role !== 'BODY') throw new Error('Sarah did not receive BODY');

  await hostRealtime.joined;
  await hostRealtime.close();

  for (const supabase of [domi, sarah]) {
    const ready = await supabase.rpc('set_ready', { p_room_id: room.room_id, p_ready: true });
    if (ready.error) throw ready.error;
  }

  const started = await domi.rpc('start_round', { p_room_id: room.room_id });
  if (started.error) throw started.error;
  const roundOne = first(started.data);
  if (!roundOne?.id || roundOne.status !== 'drawing') throw new Error('Round one did not start');

  await submitPair(domi, sarah, roundOne.id, '1');

  const revealOne = await domi.from('rooms')
    .select('status,next_round_at')
    .eq('id', room.room_id)
    .single();
  if (revealOne.error) throw revealOne.error;
  if (revealOne.data.status !== 'reveal' || !revealOne.data.next_round_at) {
    throw new Error('Round one did not enter timed reveal');
  }

  const readyState = await domi.from('room_players')
    .select('ready')
    .eq('room_id', room.room_id);
  if (readyState.error) throw readyState.error;
  if ((readyState.data ?? []).some((player) => player.ready)) {
    throw new Error('Ready state was not reset after reveal');
  }

  for (const supabase of [domi, sarah]) {
    const ready = await supabase.rpc('set_ready', { p_room_id: room.room_id, p_ready: true });
    if (ready.error) throw ready.error;
  }

  const advanced = await sarah.rpc('advance_round', { p_room_id: room.room_id });
  if (advanced.error) throw advanced.error;
  const roundTwo = first(advanced.data);
  if (!roundTwo?.id || roundTwo.id === roundOne.id || roundTwo.status !== 'drawing') {
    throw new Error('Ready check did not advance to a second round in the same room');
  }

  const stillSameRoom = await domi.from('rooms')
    .select('id,code,status,next_round_at')
    .eq('id', room.room_id)
    .single();
  if (stillSameRoom.error) throw stillSameRoom.error;
  if (stillSameRoom.data.code !== room.room_code || stillSameRoom.data.status !== 'drawing') {
    throw new Error('Room was not preserved for round two');
  }

  await submitPair(domi, sarah, roundTwo.id, '2');

  const leave = await sarah.rpc('leave_room', { p_room_id: room.room_id });
  if (leave.error) throw leave.error;

  const afterSarahLeaves = await domi.from('rooms')
    .select('status')
    .eq('id', room.room_id)
    .single();
  if (afterSarahLeaves.error) throw afterSarahLeaves.error;
  if (afterSarahLeaves.data.status !== 'waiting') {
    throw new Error('Host room did not return to waiting after Sarah left');
  }

  const playersAfterLeave = await domi.from('room_players')
    .select('user_id')
    .eq('room_id', room.room_id);
  if (playersAfterLeave.error) throw playersAfterLeave.error;
  if ((playersAfterLeave.data ?? []).length !== 1) {
    throw new Error('Sarah membership was not removed');
  }

  const close = await domi.rpc('leave_room', { p_room_id: room.room_id });
  if (close.error) throw close.error;

  await wait(150);
  const closedRoom = await domi.from('rooms').select('id').eq('id', room.room_id).maybeSingle();
  if (closedRoom.error) throw closedRoom.error;
  if (closedRoom.data) throw new Error('Host leave did not close the room');

  console.log(`Crocat persistent-room smoke passed: ${room.room_code}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
