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
  return supabase;
}

const first = (data) => Array.isArray(data) ? data[0] : data;

async function main() {
  const domi = await guest('Domi');
  const sarah = await guest('Sarah');

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
  const joinTicket = first(joined.data);
  if (joinTicket?.player_role !== 'BODY') throw new Error('Sarah did not receive BODY');

  for (const supabase of [domi, sarah]) {
    const ready = await supabase.rpc('set_ready', { p_room_id: room.room_id, p_ready: true });
    if (ready.error) throw ready.error;
  }

  const started = await domi.rpc('start_round', { p_room_id: room.room_id });
  if (started.error) throw started.error;
  const round = first(started.data);
  if (!round?.id || round.status !== 'drawing') throw new Error('Round did not start correctly');

  const head = {
    id: 'smoke-head',
    strokes: [{ id: 'h1', points: [{ x: 20, y: 20 }, { x: 40, y: 40 }], color: '#17221D', width: 6, opacity: 1 }],
  };
  const body = {
    id: 'smoke-body',
    strokes: [{ id: 'b1', points: [{ x: 20, y: 40 }, { x: 40, y: 80 }], color: '#17221D', width: 6, opacity: 1 }],
  };

  const headResult = await domi.rpc('submit_drawing', {
    p_round_id: round.id, p_role: 'HEAD', p_drawing: head,
  });
  if (headResult.error) throw headResult.error;

  const bodyResult = await sarah.rpc('submit_drawing', {
    p_round_id: round.id, p_role: 'BODY', p_drawing: body,
  });
  if (bodyResult.error) throw bodyResult.error;

  const state = await domi.from('rooms').select('status').eq('id', room.room_id).single();
  if (state.error) throw state.error;
  if (state.data.status !== 'reveal') throw new Error(`Expected reveal, got ${state.data.status}`);

  const submissions = await domi.from('submissions').select('role').eq('round_id', round.id);
  if (submissions.error) throw submissions.error;
  const roles = new Set((submissions.data ?? []).map((row) => row.role));
  if (!roles.has('HEAD') || !roles.has('BODY')) throw new Error('Both halves are not visible at reveal');

  console.log(`Crocat online smoke passed: ${room.room_code}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
