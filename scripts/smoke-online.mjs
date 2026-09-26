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
  if (error) throw error;
  if (!data.user) throw new Error(`${name} anonymous auth returned no user`);
  return { supabase, user: data.user };
}

const first = (data) => Array.isArray(data) ? data[0] : data;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertFreshDeadline(value, label) {
  if (!value) throw new Error(`${label} is missing`);
  const remainingMs = new Date(value).getTime() - Date.now();
  if (remainingMs < 10000 || remainingMs > 16000) {
    throw new Error(`${label} is not a fresh 15-second deadline: ${remainingMs}ms`);
  }
}

function drawing(id) {
  return {
    id,
    strokes: [{
      id: `${id}-stroke`,
      points: [{ x: 20, y: 20 }, { x: 60, y: 70 }],
      color: '#17221D',
      width: 6,
      opacity: 1,
    }],
  };
}

async function main() {
  // Direct room-route regression coverage: /online/room/[code] now uses
  // the same atomic join-or-create operation as the room-code entry screen.
  const routeHostGuest = await guest('RouteHost');
  const routeJoinerGuest = await guest('RouteJoiner');
  const routeHost = routeHostGuest.supabase;
  const routeJoiner = routeJoinerGuest.supabase;
  const routeCode = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, '0');

  const routeCreated = await routeHost.rpc('join_or_create_room', {
    p_code: routeCode,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 10,
  });
  if (routeCreated.error) throw routeCreated.error;
  const routeRoom = first(routeCreated.data);
  if (!routeRoom?.room_id || routeRoom.room_code !== routeCode || routeRoom.player_role !== 'HEAD') {
    throw new Error('Unknown direct room link did not create the requested room');
  }

  const routeHostRejoin = await routeHost.rpc('join_or_create_room', {
    p_code: routeCode,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 10,
  });
  if (routeHostRejoin.error) throw routeHostRejoin.error;
  const rejoinedHost = first(routeHostRejoin.data);
  if (rejoinedHost?.room_id !== routeRoom.room_id || rejoinedHost?.player_role !== 'HEAD') {
    throw new Error('Existing host could not reload through direct room route');
  }

  const routeGuestJoin = await routeJoiner.rpc('join_or_create_room', {
    p_code: routeCode,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 10,
  });
  if (routeGuestJoin.error) throw routeGuestJoin.error;
  const joinedRouteGuest = first(routeGuestJoin.data);
  if (joinedRouteGuest?.room_id !== routeRoom.room_id || joinedRouteGuest?.player_role !== 'BODY') {
    throw new Error('Available direct room link did not join the second player');
  }

  const routeCleanup = await routeHost.rpc('leave_room', { p_room_id: routeRoom.room_id });
  if (routeCleanup.error) throw routeCleanup.error;

  const domiGuest = await guest('Domi');
  const sarahGuest = await guest('Sarah');
  const thirdGuest = await guest('Third');
  const domi = domiGuest.supabase;
  const sarah = sarahGuest.supabase;
  const third = thirdGuest.supabase;

  const code = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, '0');

  const created = await domi.rpc('join_or_create_room', {
    p_code: code,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 10,
  });
  if (created.error) throw created.error;
  const room = first(created.data);
  if (!room?.room_id || room.room_code !== code) throw new Error('Room creation failed');

  const joined = await sarah.rpc('join_or_create_room', {
    p_code: code,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 10,
  });
  if (joined.error) throw joined.error;

  const heartbeat = await domi.rpc('touch_room_presence', { p_room_id: room.room_id });
  if (heartbeat.error) throw heartbeat.error;

  const fullJoin = await third.rpc('join_or_create_room', {
    p_code: code,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 10,
  });
  if (!fullJoin.error) throw new Error('Third player was able to open a full room link');

  const guestReady = await sarah.rpc('set_ready', {
    p_room_id: room.room_id,
    p_ready: true,
  });
  if (guestReady.error) throw guestReady.error;

  const started = await domi.rpc('start_round', { p_room_id: room.room_id });
  if (started.error) throw started.error;
  const round = first(started.data);

  const activeMemberReload = await domi.rpc('join_or_create_room', {
    p_code: code,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 10,
  });
  if (activeMemberReload.error) throw activeMemberReload.error;
  const activeMemberTicket = first(activeMemberReload.data);
  if (activeMemberTicket?.room_id !== room.room_id) {
    throw new Error('Existing member could not reload a room after the round started');
  }

  const activeOutsiderJoin = await third.rpc('join_or_create_room', {
    p_code: code,
    p_host_display_name: 'Domi',
    p_guest_display_name: 'Sarah',
    p_round_seconds: 10,
  });
  if (!activeOutsiderJoin.error) {
    throw new Error('Outsider was able to open a direct link to an already-started room');
  }

  if (round?.status !== 'prompt_select') {
    throw new Error(`Expected prompt_select, got ${round?.status}`);
  }

  const memberIds = new Set([domiGuest.user.id, sarahGuest.user.id]);
  if (
    !memberIds.has(round.head_player_id)
    || !memberIds.has(round.body_player_id)
    || round.head_player_id === round.body_player_id
  ) {
    throw new Error('Random round roles are invalid');
  }

  if (!Array.isArray(round.prompt_options) || round.prompt_options.length !== 3) {
    throw new Error('Expected three prompt options');
  }

  const initialThemes = new Set(round.prompt_options.map((option) => option.theme));
  if (initialThemes.size !== 3) throw new Error('Initial prompt themes are not distinct');

  const allowedPromptThemes = new Set(['Mystisch', 'Fantasy', 'Natur', 'Elegant', 'Genuss']);
  if (round.prompt_options.some((option) => !allowedPromptThemes.has(option.theme))) {
    throw new Error('Prompt selection returned a legacy or invalid theme');
  }
  if (round.prompt_options.some((option) => !option.headLabel || !option.bodyLabel)) {
    throw new Error('Prompt selection is missing semantic split labels');
  }

  const head = round.head_player_id === domiGuest.user.id ? domi : sarah;
  const body = round.body_player_id === domiGuest.user.id ? domi : sarah;
  const headUser = round.head_player_id === domiGuest.user.id ? domiGuest.user : sarahGuest.user;
  const bodyUser = round.body_player_id === domiGuest.user.id ? domiGuest.user : sarahGuest.user;

  const bodyView = await body
    .from('game_rounds')
    .select('prompt_options,prompt_reroll_used,status')
    .eq('id', round.id)
    .single();
  if (bodyView.error) throw bodyView.error;
  if (bodyView.data.prompt_options.length !== 3) {
    throw new Error('BODY cannot see prompt selection state');
  }

  const forbiddenPick = await body.rpc('select_prompt', {
    p_round_id: round.id,
    p_term: round.prompt_options[0].term,
  });
  if (!forbiddenPick.error) throw new Error('BODY was able to choose the prompt');

  const originalTerms = new Set(round.prompt_options.map((option) => option.term));
  const rerolled = await head.rpc('reroll_prompt', { p_round_id: round.id });
  if (rerolled.error) throw rerolled.error;
  const rerolledRound = first(rerolled.data);

  if (!rerolledRound.prompt_reroll_used) throw new Error('Reroll flag was not set');
  const rerolledThemes = new Set(rerolledRound.prompt_options.map((option) => option.theme));
  if (rerolledThemes.size !== 3) throw new Error('Rerolled prompt themes are not distinct');
  if (rerolledRound.prompt_options.some((option) => !allowedPromptThemes.has(option.theme))) {
    throw new Error('Reroll returned a legacy or invalid theme');
  }
  if (rerolledRound.prompt_options.some((option) => !option.headLabel || !option.bodyLabel)) {
    throw new Error('Rerolled prompts are missing semantic split labels');
  }
  if (rerolledRound.prompt_options.some((option) => originalTerms.has(option.term))) {
    throw new Error('Reroll repeated an old prompt term');
  }

  const secondReroll = await head.rpc('reroll_prompt', { p_round_id: round.id });
  if (!secondReroll.error) throw new Error('Second reroll was allowed');

  let promptRealtimeSeen = false;
  const promptChannel = body
    .channel(`smoke-prompt-${round.id}-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'game_rounds', filter: `id=eq.${round.id}` },
      () => {
        promptRealtimeSeen = true;
      },
    );

  await new Promise((resolve, reject) => {
    promptChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Prompt realtime subscription failed: ${status}`));
      }
    });
  });

  const picked = rerolledRound.prompt_options[0];
  const selected = await head.rpc('select_prompt', {
    p_round_id: round.id,
    p_term: picked.term,
  });
  if (selected.error) throw selected.error;
  const drawingRound = first(selected.data);

  if (
    drawingRound.status !== 'drawing'
    || drawingRound.prompt_term !== picked.term
    || drawingRound.prompt_theme !== picked.theme
  ) {
    throw new Error('Prompt selection did not start drawing correctly');
  }

  const selectedPrompt = drawingRound.prompt_options.find(
    (option) => option.term === drawingRound.prompt_term,
  );
  if (!selectedPrompt?.headLabel || !selectedPrompt?.bodyLabel) {
    throw new Error('Selected prompt lost its semantic split labels');
  }

  for (let attempt = 0; attempt < 100 && !promptRealtimeSeen; attempt += 1) {
    await wait(100);
  }
  await body.removeChannel(promptChannel);
  if (!promptRealtimeSeen) {
    throw new Error('BODY did not receive the prompt-to-drawing realtime update');
  }

  const playerRows = await domi
    .from('room_players')
    .select('user_id,role')
    .eq('room_id', room.room_id);
  if (playerRows.error) throw playerRows.error;

  const headRow = playerRows.data.find((player) => player.user_id === headUser.id);
  const bodyRow = playerRows.data.find((player) => player.user_id === bodyUser.id);
  if (headRow?.role !== 'HEAD' || bodyRow?.role !== 'BODY') {
    throw new Error('Room player roles do not match round role assignment');
  }

  const headSubmit = await head.rpc('submit_drawing', {
    p_round_id: round.id,
    p_role: 'HEAD',
    p_drawing: drawing('head-v1'),
  });
  if (headSubmit.error) throw headSubmit.error;

  const submittedHead = await body
    .from('submissions')
    .select('submitted,drawing')
    .eq('round_id', round.id)
    .eq('player_id', headUser.id)
    .single();
  if (submittedHead.error) throw submittedHead.error;
  if (!submittedHead.data.submitted) throw new Error('Early HEAD submission not marked submitted');

  const resume = await head.rpc('resume_drawing', { p_round_id: round.id });
  if (resume.error) throw resume.error;

  const resumedHead = await body
    .from('submissions')
    .select('submitted')
    .eq('round_id', round.id)
    .eq('player_id', headUser.id)
    .single();
  if (resumedHead.error) throw resumedHead.error;
  if (resumedHead.data.submitted) throw new Error('Resume did not clear submitted status');

  const headResubmit = await head.rpc('submit_drawing', {
    p_round_id: round.id,
    p_role: 'HEAD',
    p_drawing: drawing('head-v2'),
  });
  if (headResubmit.error) throw headResubmit.error;

  const bodySubmit = await body.rpc('submit_drawing', {
    p_round_id: round.id,
    p_role: 'BODY',
    p_drawing: drawing('body-v1'),
  });
  if (bodySubmit.error) throw bodySubmit.error;

  const earlyState = await domi
    .from('rooms')
    .select('status')
    .eq('id', room.room_id)
    .single();
  if (earlyState.error) throw earlyState.error;
  if (earlyState.data.status !== 'adjusting') {
    throw new Error('Both submitted drawings did not immediately enter Adjustment');
  }

  const adjustment = await domi
    .from('game_rounds')
    .select('status,adjustment_ends_at,final_reveal_ends_at')
    .eq('id', round.id)
    .single();
  if (adjustment.error) throw adjustment.error;
  if (adjustment.data.status !== 'adjusting') {
    throw new Error('Drawing deadline did not enter adjustment');
  }
  assertFreshDeadline(adjustment.data.adjustment_ends_at, 'Adjustment deadline');
  if (adjustment.data.final_reveal_ends_at !== null) {
    throw new Error('Final Reveal deadline was precomputed before Final Reveal started');
  }

  const headTransform = await head.rpc('save_transform', {
    p_round_id: round.id,
    p_role: 'HEAD',
    p_transform: { x: 8, y: -3, scale: 1.05 },
  });
  if (headTransform.error) throw headTransform.error;

  const wrongTransform = await body.rpc('save_transform', {
    p_round_id: round.id,
    p_role: 'HEAD',
    p_transform: { x: 0, y: 0, scale: 1 },
  });
  if (!wrongTransform.error) throw new Error('BODY was able to modify HEAD transform');

  const firstAdjustReady = await head.rpc('set_ready', {
    p_room_id: room.room_id,
    p_ready: true,
  });
  if (firstAdjustReady.error) throw firstAdjustReady.error;

  const oneReadyAdvance = await head.rpc('advance_phase', { p_room_id: room.room_id });
  if (oneReadyAdvance.error) throw oneReadyAdvance.error;

  const oneReadyState = await domi
    .from('game_rounds')
    .select('status')
    .eq('id', round.id)
    .single();
  if (oneReadyState.error) throw oneReadyState.error;
  if (oneReadyState.data.status !== 'adjusting') {
    throw new Error('1/2 Adjustment Ready ended the phase too early');
  }

  const secondAdjustReady = await body.rpc('set_ready', {
    p_room_id: room.room_id,
    p_ready: true,
  });
  if (secondAdjustReady.error) throw secondAdjustReady.error;

  const twoReadyAdvance = await body.rpc('advance_phase', { p_room_id: room.room_id });
  if (twoReadyAdvance.error) throw twoReadyAdvance.error;

  const twoReadyState = await domi
    .from('game_rounds')
    .select('status,final_reveal_ends_at')
    .eq('id', round.id)
    .single();
  if (twoReadyState.error) throw twoReadyState.error;
  if (twoReadyState.data.status !== 'final_reveal') {
    throw new Error('2/2 Adjustment Ready did not start Final Reveal');
  }
  assertFreshDeadline(twoReadyState.data.final_reveal_ends_at, 'Final Reveal deadline');

  const revealRoom = await domi
    .from('rooms')
    .select('next_round_at')
    .eq('id', room.room_id)
    .single();
  if (revealRoom.error) throw revealRoom.error;
  if (
    Math.abs(
      new Date(revealRoom.data.next_round_at).getTime()
      - new Date(twoReadyState.data.final_reveal_ends_at).getTime(),
    ) > 100
  ) {
    throw new Error('Room next-round deadline is not synchronized with Final Reveal');
  }

  for (const activeClient of [domi, sarah]) {
    const ready = await activeClient.rpc('set_ready', {
      p_room_id: room.room_id,
      p_ready: true,
    });
    if (ready.error) throw ready.error;
  }

  const next = await domi.rpc('advance_phase', { p_room_id: room.room_id });
  if (next.error) throw next.error;
  const nextRound = first(next.data);

  if (nextRound?.status !== 'prompt_select' || nextRound.id === round.id) {
    throw new Error('Next round did not return to prompt selection');
  }

  const nextThemes = new Set(nextRound.prompt_options.map((option) => option.theme));
  if (nextRound.prompt_options.length !== 3 || nextThemes.size !== 3) {
    throw new Error('Next round prompt options are invalid');
  }

  await wait(Math.max(
    0,
    new Date(nextRound.prompt_selection_ends_at).getTime() - Date.now() + 600,
  ));

  const timedPrompt = await sarah.rpc('advance_prompt', { p_round_id: nextRound.id });
  if (timedPrompt.error) throw timedPrompt.error;
  const timedDrawing = first(timedPrompt.data);

  if (
    timedDrawing?.status !== 'drawing'
    || !timedDrawing.prompt_term
    || !timedDrawing.prompt_theme
  ) {
    throw new Error('Prompt timeout did not auto-select a current option');
  }

  const selectedWasOffered = nextRound.prompt_options.some(
    (option) =>
      option.term === timedDrawing.prompt_term
      && option.theme === timedDrawing.prompt_theme,
  );
  if (!selectedWasOffered) {
    throw new Error('Prompt timeout selected something outside the current three options');
  }

  const leaveSarah = await sarah.rpc('leave_room', { p_room_id: room.room_id });
  if (leaveSarah.error) throw leaveSarah.error;

  const close = await domi.rpc('leave_room', { p_room_id: room.room_id });
  if (close.error) throw close.error;

  console.log(`Crocat 1.4.8 gameplay smoke passed: ${code}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
