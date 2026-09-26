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

async function subscribe(channel) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), 10000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(`Realtime channel failed: ${status}`));
      }
    });
  });
}

async function submitPair(domi, sarah, roundId) {
  const head = {
    id: 'smoke-head',
    strokes: [{ id: 'h1', points: [{ x: 20, y: 20 }, { x: 40, y: 40 }], color: '#17221D', width: 6, opacity: 1 }],
  };
  const body = {
    id: 'smoke-body',
    strokes: [{ id: 'b1', points: [{ x: 20, y: 40 }, { x: 40, y: 80 }], color: '#17221D', width: 6, opacity: 1 }],
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

async function verifyBroadcast(domi, sarah, roundId) {
  let resolveTransform;
  let rejectTransform;

  const received = new Promise((resolve, reject) => {
    resolveTransform = resolve;
    rejectTransform = reject;
  });

  const sarahChannel = sarah
    .channel(`adjust:${roundId}`)
    .on('broadcast', { event: 'part_transform' }, ({ payload }) => {
      if (payload?.role === 'HEAD' && payload?.transform?.x === 12) {
        resolveTransform();
      }
    });

  const domiChannel = domi.channel(`adjust:${roundId}`);

  await Promise.all([subscribe(sarahChannel), subscribe(domiChannel)]);

  const timeout = setTimeout(
    () => rejectTransform(new Error('Sarah did not receive Domi HEAD transform broadcast')),
    10000,
  );

  await domiChannel.send({
    type: 'broadcast',
    event: 'part_transform',
    payload: { role: 'HEAD', transform: { x: 12, y: -4, scale: 1.05 } },
  });

  await received.finally(() => clearTimeout(timeout));

  await Promise.all([
    domi.removeChannel(domiChannel),
    sarah.removeChannel(sarahChannel),
  ]);
}

async function main() {
  const { supabase: domi } = await guest('Domi');
  const { supabase: sarah } = await guest('Sarah');

  const created = await domi.rpc('create_room', {
    p_display_name: 'Domi',
    p_round_seconds: 30,
  });
  if (created.error) throw created.error;
  const room = first(created.data);
  if (!room?.room_id || !room?.room_code || room.player_role !== 'HEAD') {
    throw new Error('create_room returned an invalid room ticket');
  }

  const joined = await sarah.rpc('join_room', {
    p_code: room.room_code,
    p_display_name: 'Sarah',
  });
  if (joined.error) throw joined.error;
  if (first(joined.data)?.player_role !== 'BODY') {
    throw new Error('Sarah did not receive BODY');
  }

  for (const supabase of [domi, sarah]) {
    const ready = await supabase.rpc('set_ready', {
      p_room_id: room.room_id,
      p_ready: true,
    });
    if (ready.error) throw ready.error;
  }

  const started = await domi.rpc('start_round', { p_room_id: room.room_id });
  if (started.error) throw started.error;
  const round = first(started.data);
  if (!round?.id || round.status !== 'drawing') throw new Error('Round did not start');

  await submitPair(domi, sarah, round.id);

  const adjustment = await domi
    .from('game_rounds')
    .select('status,adjustment_ends_at,final_reveal_ends_at')
    .eq('id', round.id)
    .single();
  if (adjustment.error) throw adjustment.error;

  if (
    adjustment.data.status !== 'adjusting'
    || !adjustment.data.adjustment_ends_at
    || !adjustment.data.final_reveal_ends_at
  ) {
    throw new Error('Round did not enter synchronized adjustment');
  }

  await verifyBroadcast(domi, sarah, round.id);

  const headTransform = { x: 12, y: -4, scale: 1.05 };
  const bodyTransform = { x: -9, y: 6, scale: 0.95 };

  const saveHead = await domi.rpc('save_transform', {
    p_round_id: round.id,
    p_role: 'HEAD',
    p_transform: headTransform,
  });
  if (saveHead.error) throw saveHead.error;

  const saveBody = await sarah.rpc('save_transform', {
    p_round_id: round.id,
    p_role: 'BODY',
    p_transform: bodyTransform,
  });
  if (saveBody.error) throw saveBody.error;

  const forbidden = await sarah.rpc('save_transform', {
    p_round_id: round.id,
    p_role: 'HEAD',
    p_transform: { x: 0, y: 0, scale: 1 },
  });
  if (!forbidden.error) throw new Error('Sarah was able to modify HEAD');

  const stored = await domi
    .from('submissions')
    .select('role,transform')
    .eq('round_id', round.id);
  if (stored.error) throw stored.error;

  const byRole = new Map((stored.data ?? []).map((row) => [row.role, row.transform]));
  if (Number(byRole.get('HEAD')?.x) !== 12 || Number(byRole.get('BODY')?.x) !== -9) {
    throw new Error('Transforms were not persisted per role');
  }

  const adjustmentWait = Math.max(
    0,
    new Date(adjustment.data.adjustment_ends_at).getTime() - Date.now() + 600,
  );
  await wait(adjustmentWait);

  const toReveal = await domi.rpc('advance_phase', { p_room_id: room.room_id });
  if (toReveal.error) throw toReveal.error;

  const finalReveal = await domi
    .from('game_rounds')
    .select('status,final_reveal_ends_at')
    .eq('id', round.id)
    .single();
  if (finalReveal.error) throw finalReveal.error;
  if (finalReveal.data.status !== 'final_reveal') {
    throw new Error(`Expected final_reveal, got ${finalReveal.data.status}`);
  }

  const revealWait = Math.max(
    0,
    new Date(finalReveal.data.final_reveal_ends_at).getTime() - Date.now() + 600,
  );
  await wait(revealWait);

  const next = await sarah.rpc('advance_phase', { p_room_id: room.room_id });
  if (next.error) throw next.error;
  const nextRound = first(next.data);
  if (!nextRound?.id || nextRound.id === round.id || nextRound.status !== 'drawing') {
    throw new Error('Final reveal did not auto-advance to a new drawing round');
  }

  const sameRoom = await domi
    .from('rooms')
    .select('id,code,status')
    .eq('id', room.room_id)
    .single();
  if (sameRoom.error) throw sameRoom.error;
  if (sameRoom.data.code !== room.room_code || sameRoom.data.status !== 'drawing') {
    throw new Error('Next round did not stay in the same room');
  }

  const leaveSarah = await sarah.rpc('leave_room', { p_room_id: room.room_id });
  if (leaveSarah.error) throw leaveSarah.error;

  const afterSarahLeaves = await domi
    .from('rooms')
    .select('status')
    .eq('id', room.room_id)
    .single();
  if (afterSarahLeaves.error) throw afterSarahLeaves.error;
  if (afterSarahLeaves.data.status !== 'waiting') {
    throw new Error('Host room did not return to waiting after Sarah left');
  }

  const close = await domi.rpc('leave_room', { p_room_id: room.room_id });
  if (close.error) throw close.error;

  console.log(`Crocat adjustment smoke passed: ${room.room_code}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
