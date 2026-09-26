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

  const requestedCode = Date.now()
    .toString(36)
    .toUpperCase()
    .slice(-6)
    .padStart(6, '0');

  const created = await domi.rpc('join_or_create_room', {
    p_code: requestedCode,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 30,
  });
  if (created.error) throw created.error;
  const room = first(created.data);
  if (
    !room?.room_id
    || room.room_code !== requestedCode
    || room.player_role !== 'HEAD'
  ) {
    throw new Error('Joining an empty code did not create the requested room as HEAD');
  }

  const joined = await sarah.rpc('join_or_create_room', {
    p_code: requestedCode,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 30,
  });
  if (joined.error) throw joined.error;
  const joinedRoom = first(joined.data);
  if (
    joinedRoom?.room_id !== room.room_id
    || joinedRoom?.room_code !== requestedCode
    || joinedRoom?.player_role !== 'BODY'
  ) {
    throw new Error('Second join did not enter the existing room as BODY');
  }

  const hostSettings = await domi.rpc('update_room_settings', {
    p_room_id: room.room_id,
    p_round_seconds: 120,
  });
  if (hostSettings.error) throw hostSettings.error;

  const configuredRoom = await sarah
    .from('rooms')
    .select('round_seconds')
    .eq('id', room.room_id)
    .single();
  if (configuredRoom.error) throw configuredRoom.error;
  if (configuredRoom.data.round_seconds !== 120) {
    throw new Error('Guest did not observe the host room-time setting');
  }

  const guestSettings = await sarah.rpc('update_room_settings', {
    p_room_id: room.room_id,
    p_round_seconds: 60,
  });
  if (!guestSettings.error) {
    throw new Error('Guest was able to modify room settings');
  }

  const hostReady = await domi.rpc('set_ready', {
    p_room_id: room.room_id,
    p_ready: true,
  });
  if (!hostReady.error) throw new Error('Host was able to set Ready');

  const earlyStart = await domi.rpc('start_round', { p_room_id: room.room_id });
  if (!earlyStart.error) throw new Error('Host started before guest was Ready');

  const guestReady = await sarah.rpc('set_ready', {
    p_room_id: room.room_id,
    p_ready: true,
  });
  if (guestReady.error) throw guestReady.error;

  const changeAfterReady = await domi.rpc('update_room_settings', {
    p_room_id: room.room_id,
    p_round_seconds: 60,
  });
  if (changeAfterReady.error) throw changeAfterReady.error;

  const readyRows = await domi
    .from('room_players')
    .select('user_id,ready')
    .eq('room_id', room.room_id);
  if (readyRows.error) throw readyRows.error;
  const guestRow = (readyRows.data ?? []).find((row) => row.user_id !== room.host_id);
  if (guestRow?.ready) {
    throw new Error('Changing room settings did not clear guest Ready');
  }

  const guestReadyAgain = await sarah.rpc('set_ready', {
    p_room_id: room.room_id,
    p_ready: true,
  });
  if (guestReadyAgain.error) throw guestReadyAgain.error;

  const started = await domi.rpc('start_round', { p_room_id: room.room_id });
  if (started.error) throw started.error;
  const round = first(started.data);
  if (!round?.id || round.status !== 'drawing') throw new Error('Round did not start');
  const configuredDuration = Math.round(
    (new Date(round.ends_at).getTime() - new Date(round.started_at).getTime()) / 1000,
  );
  if (configuredDuration !== 60) {
    throw new Error(`Round did not use host configuration: ${configuredDuration}s`);
  }

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

  const revealDeadlineMs = new Date(finalReveal.data.final_reveal_ends_at).getTime();
  if (revealDeadlineMs - Date.now() < 5000) {
    throw new Error('Not enough Final Reveal time remained to verify Ready skip');
  }

  const domiReadyNext = await domi.rpc('set_ready', {
    p_room_id: room.room_id,
    p_ready: true,
  });
  if (domiReadyNext.error) throw domiReadyNext.error;

  const oneReadyAdvance = await domi.rpc('advance_phase', {
    p_room_id: room.room_id,
  });
  if (oneReadyAdvance.error) throw oneReadyAdvance.error;
  if (first(oneReadyAdvance.data)) {
    throw new Error('One ready player was enough to skip Final Reveal');
  }

  const stillReveal = await sarah
    .from('rooms')
    .select('status')
    .eq('id', room.room_id)
    .single();
  if (stillReveal.error) throw stillReveal.error;
  if (stillReveal.data.status !== 'final_reveal') {
    throw new Error('Room left Final Reveal with only one ready player');
  }

  const sarahReadyNext = await sarah.rpc('set_ready', {
    p_room_id: room.room_id,
    p_ready: true,
  });
  if (sarahReadyNext.error) throw sarahReadyNext.error;

  const next = await sarah.rpc('advance_phase', { p_room_id: room.room_id });
  if (next.error) throw next.error;
  const nextRound = first(next.data);
  if (!nextRound?.id || nextRound.id === round.id || nextRound.status !== 'drawing') {
    throw new Error('Two ready players did not skip Final Reveal');
  }

  if (Date.now() >= revealDeadlineMs) {
    throw new Error('Ready skip completed only after the Final Reveal deadline');
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

  console.log(`Crocat room-settings smoke passed: ${room.room_code}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
