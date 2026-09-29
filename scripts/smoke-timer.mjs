import { createClient } from '@supabase/supabase-js';

const url = 'https://ufryvzzzegoltrwcpkls.supabase.co';
const key = 'sb_publishable_aeZDV23ZRp855C9bKmRlCw_F9NpihWS';

function client() {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function guest(name) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: name, crocat_timer_smoke: true } },
  });
  if (error) throw error;
  if (!data.user) throw new Error('Anonymous timer-smoke user missing');
  return { supabase, user: data.user };
}

function first(data) {
  return Array.isArray(data) ? data[0] : data;
}

function assertWaiting(label, round) {
  if (round.phase_timer_started_at !== null) {
    throw new Error(label + ' timer started before both players entered the phase');
  }
}

async function loadRound(supabase, roundId) {
  const { data, error } = await supabase
    .from('game_rounds')
    .select('*')
    .eq('id', roundId)
    .single();
  if (error) throw error;
  return data;
}

async function enterPhase(supabase, roundId, phase) {
  const { data, error } = await supabase.rpc('enter_phase', {
    p_round_id: roundId,
    p_phase: phase,
  });
  if (error) throw error;
  return first(data);
}

async function calibratedNow(supabase, artificialSkewMs) {
  const samples = [];

  for (let index = 0; index < 3; index += 1) {
    const before = Date.now() + artificialSkewMs;
    const { data, error } = await supabase.rpc('server_clock_ms');
    const after = Date.now() + artificialSkewMs;
    if (error) throw error;

    const serverMs = Number(data);
    if (!Number.isFinite(serverMs)) {
      throw new Error('server_clock_ms returned an invalid timestamp');
    }

    const midpoint = before + ((after - before) / 2);
    samples.push({
      rtt: after - before,
      offset: serverMs - midpoint,
    });
  }

  samples.sort((left, right) => left.rtt - right.rtt);
  return Date.now() + artificialSkewMs + samples[0].offset;
}

function remainingSeconds(deadline, nowMs) {
  return Math.max(
    0,
    Math.ceil((new Date(deadline).getTime() - nowMs) / 1000),
  );
}

async function assertSyncedCountdown(
  label,
  deadline,
  leftClient,
  rightClient,
  minSeconds,
  maxSeconds,
) {
  const [leftNow, rightNow] = await Promise.all([
    calibratedNow(leftClient, 120_000),
    calibratedNow(rightClient, -90_000),
  ]);
  const left = remainingSeconds(deadline, leftNow);
  const right = remainingSeconds(deadline, rightNow);

  if (Math.abs(left - right) > 1) {
    throw new Error(
      label + ' countdown diverged after server-clock calibration: '
      + left + 's vs ' + right + 's',
    );
  }

  if (
    left < minSeconds
    || left > maxSeconds
    || right < minSeconds
    || right > maxSeconds
  ) {
    throw new Error(
      label + ' countdown did not begin in the expected window: '
      + left + 's / ' + right + 's',
    );
  }

  return { left, right };
}

async function main() {
  const alphaGuest = await guest('TimerAlpha');
  const betaGuest = await guest('TimerBeta');
  const alpha = alphaGuest.supabase;
  const beta = betaGuest.supabase;

  const created = await alpha.rpc('create_room', {
    p_display_name: 'TimerAlpha',
    p_round_seconds: 10,
  });
  if (created.error) throw created.error;
  const room = first(created.data);

  const joined = await beta.rpc('join_room', {
    p_code: room.room_code,
    p_display_name: 'TimerBeta',
  });
  if (joined.error) throw joined.error;

  for (const activeClient of [alpha, beta]) {
    const timerSync = await activeClient.rpc('enable_phase_timer_sync', {
      p_room_id: room.room_id,
    });
    if (timerSync.error) throw timerSync.error;

    const ready = await activeClient.rpc('set_ready', {
      p_room_id: room.room_id,
      p_ready: true,
    });
    if (ready.error) throw ready.error;
  }

  const started = await alpha.rpc('start_round', {
    p_room_id: room.room_id,
  });
  if (started.error) throw started.error;
  const round = first(started.data);
  assertWaiting('Prompt', round);

  assertWaiting(
    'Prompt after first entry',
    await enterPhase(alpha, round.id, 'prompt_select'),
  );
  const promptStarted = await enterPhase(beta, round.id, 'prompt_select');
  if (!promptStarted.phase_timer_started_at) {
    throw new Error('Prompt timer did not start after the second player entered');
  }
  const promptCountdown = await assertSyncedCountdown(
    'Prompt',
    promptStarted.prompt_selection_ends_at,
    alpha,
    beta,
    12,
    15,
  );

  const headClient =
    round.head_player_id === alphaGuest.user.id ? alpha : beta;

  const selected = await headClient.rpc('select_prompt', {
    p_round_id: round.id,
    p_term: round.prompt_options[0].term,
  });
  if (selected.error) throw selected.error;
  const drawingRound = first(selected.data);
  assertWaiting('Drawing', drawingRound);

  assertWaiting(
    'Drawing after first entry',
    await enterPhase(alpha, round.id, 'drawing'),
  );
  const drawingStarted = await enterPhase(beta, round.id, 'drawing');
  if (!drawingStarted.phase_timer_started_at) {
    throw new Error('Drawing timer did not start after the second player entered');
  }
  const drawingCountdown = await assertSyncedCountdown(
    'Drawing',
    drawingStarted.ends_at,
    alpha,
    beta,
    8,
    10,
  );

  const alphaRole =
    round.head_player_id === alphaGuest.user.id ? 'HEAD' : 'BODY';
  const betaRole = alphaRole === 'HEAD' ? 'BODY' : 'HEAD';

  const alphaSubmit = await alpha.rpc('submit_drawing', {
    p_round_id: round.id,
    p_role: alphaRole,
    p_drawing: { id: 'timer-alpha', strokes: [] },
  });
  if (alphaSubmit.error) throw alphaSubmit.error;

  const betaSubmit = await beta.rpc('submit_drawing', {
    p_round_id: round.id,
    p_role: betaRole,
    p_drawing: { id: 'timer-beta', strokes: [] },
  });
  if (betaSubmit.error) throw betaSubmit.error;

  const adjustmentRound = await loadRound(alpha, round.id);
  if (adjustmentRound.status !== 'adjusting') {
    throw new Error('Timer smoke did not reach Adjustment');
  }
  assertWaiting('Adjustment', adjustmentRound);

  assertWaiting(
    'Adjustment after first entry',
    await enterPhase(alpha, round.id, 'adjusting'),
  );
  const adjustmentStarted = await enterPhase(beta, round.id, 'adjusting');
  if (!adjustmentStarted.phase_timer_started_at) {
    throw new Error('Adjustment timer did not start after the second player entered');
  }
  const adjustmentCountdown = await assertSyncedCountdown(
    'Adjustment',
    adjustmentStarted.adjustment_ends_at,
    alpha,
    beta,
    12,
    15,
  );

  for (const activeClient of [alpha, beta]) {
    const ready = await activeClient.rpc('set_ready', {
      p_room_id: room.room_id,
      p_ready: true,
    });
    if (ready.error) throw ready.error;
  }

  const revealAdvance = await alpha.rpc('advance_phase', {
    p_room_id: room.room_id,
  });
  if (revealAdvance.error) throw revealAdvance.error;

  const revealRound = await loadRound(alpha, round.id);
  if (revealRound.status !== 'final_reveal') {
    throw new Error('Timer smoke did not reach Final Reveal');
  }
  assertWaiting('Final Reveal', revealRound);

  const roomBeforeRevealTimer = await alpha
    .from('rooms')
    .select('next_round_at')
    .eq('id', room.room_id)
    .single();
  if (roomBeforeRevealTimer.error) throw roomBeforeRevealTimer.error;
  if (roomBeforeRevealTimer.data.next_round_at !== null) {
    throw new Error('Next-round deadline started before both players entered Final Reveal');
  }

  assertWaiting(
    'Final Reveal after first entry',
    await enterPhase(alpha, round.id, 'final_reveal'),
  );
  const revealStarted = await enterPhase(beta, round.id, 'final_reveal');
  if (!revealStarted.phase_timer_started_at) {
    throw new Error('Final Reveal timer did not start after the second player entered');
  }
  const revealCountdown = await assertSyncedCountdown(
    'Final Reveal',
    revealStarted.final_reveal_ends_at,
    alpha,
    beta,
    12,
    15,
  );

  const revealRoom = await alpha
    .from('rooms')
    .select('next_round_at')
    .eq('id', room.room_id)
    .single();
  if (revealRoom.error) throw revealRoom.error;
  if (
    Math.abs(
      new Date(revealRoom.data.next_round_at).getTime()
      - new Date(revealStarted.final_reveal_ends_at).getTime(),
    ) > 100
  ) {
    throw new Error('Final Reveal and next-round deadlines are not synchronized');
  }

  const betaLeave = await beta.rpc('leave_room', {
    p_room_id: room.room_id,
  });
  if (betaLeave.error) throw betaLeave.error;

  const alphaLeave = await alpha.rpc('leave_room', {
    p_room_id: room.room_id,
  });
  if (alphaLeave.error) throw alphaLeave.error;

  console.log(
    'Crocat synchronized phase-timer smoke passed',
    {
      promptCountdown,
      drawingCountdown,
      adjustmentCountdown,
      revealCountdown,
    },
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
