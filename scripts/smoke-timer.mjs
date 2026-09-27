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
) {
  const leftNow = await calibratedNow(leftClient, 120_000);
  const rightNow = await calibratedNow(rightClient, -90_000);
  const left = remainingSeconds(deadline, leftNow);
  const right = remainingSeconds(deadline, rightNow);

  if (Math.abs(left - right) > 1) {
    throw new Error(
      label + ' countdown diverged after server-clock calibration: '
      + left + 's vs ' + right + 's',
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

  const promptCountdown = await assertSyncedCountdown(
    'Prompt',
    round.prompt_selection_ends_at,
    alpha,
    beta,
  );

  if (
    promptCountdown.left < 12
    || promptCountdown.left > 15
    || promptCountdown.right < 12
    || promptCountdown.right > 15
  ) {
    throw new Error(
      'Prompt countdown did not begin near the server 15-second window',
    );
  }

  const headClient =
    round.head_player_id === alphaGuest.user.id ? alpha : beta;

  const selected = await headClient.rpc('select_prompt', {
    p_round_id: round.id,
    p_term: round.prompt_options[0].term,
  });
  if (selected.error) throw selected.error;
  const drawingRound = first(selected.data);

  const drawingCountdown = await assertSyncedCountdown(
    'Drawing',
    drawingRound.ends_at,
    alpha,
    beta,
  );

  if (
    drawingCountdown.left < 8
    || drawingCountdown.left > 10
    || drawingCountdown.right < 8
    || drawingCountdown.right > 10
  ) {
    throw new Error(
      'Drawing countdown did not begin near the configured 10-second window',
    );
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
    'Crocat 1.5.1 server-synced timer smoke passed',
    { promptCountdown, drawingCountdown },
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
