import type { CrocatDrawing, GameRole, PartTransform } from '@/src/types/game';
import { requireSupabase } from '@/src/lib/supabase';
import type {
  OnlinePlayer,
  OnlineRoom,
  OnlineRound,
  OnlineSubmission,
  RoomTicket,
} from './types';

function one<T>(data: T | T[] | null): T {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value) throw new Error('Supabase returned no data.');
  return value;
}

async function loadRoomRelations(room: OnlineRoom) {
  const supabase = requireSupabase();

  const playersResult = await supabase
    .from('room_players')
    .select('*')
    .eq('room_id', room.id)
    .order('joined_at');
  if (playersResult.error) throw playersResult.error;

  const roundResult = await supabase
    .from('game_rounds')
    .select('*')
    .eq('room_id', room.id)
    .order('started_at', { ascending: false })
    .limit(1);
  if (roundResult.error) throw roundResult.error;

  return {
    room,
    players: (playersResult.data ?? []) as OnlinePlayer[],
    round: (roundResult.data?.[0] as OnlineRound | undefined) ?? null,
  };
}

export async function createRoom(displayName: string, roundSeconds: number): Promise<RoomTicket> {
  const { data, error } = await requireSupabase().rpc('create_room', {
    p_display_name: displayName,
    p_round_seconds: roundSeconds,
  });
  if (error) throw error;
  const row = one<{ room_id: string; room_code: string; player_role: GameRole }>(data);
  return { roomId: row.room_id, code: row.room_code, role: row.player_role };
}

export async function joinRoom(code: string, displayName: string): Promise<RoomTicket> {
  const { data, error } = await requireSupabase().rpc('join_room', {
    p_code: code.trim().toUpperCase(),
    p_display_name: displayName,
  });
  if (error) throw error;
  const row = one<{ room_id: string; room_code: string; player_role: GameRole }>(data);
  return { roomId: row.room_id, code: row.room_code, role: row.player_role };
}


export async function joinOrCreateRoom(
  code: string,
  hostDisplayName: string,
  guestDisplayName: string,
  roundSeconds: number,
): Promise<RoomTicket> {
  const { data, error } = await requireSupabase().rpc('join_or_create_room', {
    p_code: code.trim().toUpperCase(),
    p_host_display_name: hostDisplayName,
    p_guest_display_name: guestDisplayName,
    p_round_seconds: roundSeconds,
  });
  if (error) throw error;
  const row = one<{ room_id: string; room_code: string; player_role: GameRole }>(data);
  return { roomId: row.room_id, code: row.room_code, role: row.player_role };
}

export async function loadRoom(code: string) {
  const roomResult = await requireSupabase()
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();
  if (roomResult.error) throw roomResult.error;
  return loadRoomRelations(roomResult.data as OnlineRoom);
}

export async function loadRoomById(roomId: string) {
  const roomResult = await requireSupabase()
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  if (roomResult.error) throw roomResult.error;
  return loadRoomRelations(roomResult.data as OnlineRoom);
}

export async function loadRound(roundId: string): Promise<OnlineRound> {
  const { data, error } = await requireSupabase()
    .from('game_rounds')
    .select('*')
    .eq('id', roundId)
    .single();
  if (error) throw error;
  return data as OnlineRound;
}

export async function setReady(roomId: string, ready: boolean) {
  const { error } = await requireSupabase().rpc('set_ready', {
    p_room_id: roomId,
    p_ready: ready,
  });
  if (error) throw error;
}

export async function startRound(roomId: string): Promise<OnlineRound> {
  const { data, error } = await requireSupabase().rpc('start_round', { p_room_id: roomId });
  if (error) throw error;
  return one<OnlineRound>(data);
}

export async function advanceRound(roomId: string): Promise<OnlineRound | null> {
  const { data, error } = await requireSupabase().rpc('advance_round', { p_room_id: roomId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as OnlineRound | undefined) ?? null;
}

export async function advancePhase(roomId: string): Promise<OnlineRound | null> {
  const { data, error } = await requireSupabase().rpc('advance_phase', { p_room_id: roomId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as OnlineRound | undefined) ?? null;
}

export async function leaveRoom(roomId: string) {
  const { error } = await requireSupabase().rpc('leave_room', { p_room_id: roomId });
  if (error) throw error;
}

export async function touchRoomPresence(roomId: string) {
  const { error } = await requireSupabase().rpc('touch_room_presence', { p_room_id: roomId });
  if (error) throw error;
}

export async function submitDrawing(
  roundId: string,
  role: GameRole,
  drawing: CrocatDrawing,
) {
  const { error } = await requireSupabase().rpc('submit_drawing', {
    p_round_id: roundId,
    p_role: role,
    p_drawing: drawing,
  });
  if (error) throw error;
}

export async function saveTransform(
  roundId: string,
  role: GameRole,
  transform: PartTransform,
) {
  const { error } = await requireSupabase().rpc('save_transform', {
    p_round_id: roundId,
    p_role: role,
    p_transform: transform,
  });
  if (error) throw error;
}

export async function loadSubmissions(roundId: string): Promise<OnlineSubmission[]> {
  const { data, error } = await requireSupabase()
    .from('submissions')
    .select('*')
    .eq('round_id', roundId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as OnlineSubmission[];
}


export async function updateRoomSettings(roomId: string, roundSeconds: number) {
  const { error } = await requireSupabase().rpc('update_room_settings', {
    p_room_id: roomId,
    p_round_seconds: roundSeconds,
  });
  if (error) throw error;
}


export async function selectPrompt(roundId: string, term: string): Promise<OnlineRound> {
  const { data, error } = await requireSupabase().rpc('select_prompt', {
    p_round_id: roundId,
    p_term: term,
  });
  if (error) throw error;
  return one<OnlineRound>(data);
}

export async function rerollPrompt(roundId: string): Promise<OnlineRound> {
  const { data, error } = await requireSupabase().rpc('reroll_prompt', {
    p_round_id: roundId,
  });
  if (error) throw error;
  return one<OnlineRound>(data);
}

export async function advancePrompt(roundId: string): Promise<OnlineRound | null> {
  const { data, error } = await requireSupabase().rpc('advance_prompt', {
    p_round_id: roundId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as OnlineRound | undefined) ?? null;
}

export async function resumeDrawing(roundId: string) {
  const { error } = await requireSupabase().rpc('resume_drawing', {
    p_round_id: roundId,
  });
  if (error) throw error;
}

export async function advanceDrawing(roundId: string) {
  const { error } = await requireSupabase().rpc('advance_drawing', {
    p_round_id: roundId,
  });
  if (error) throw error;
}
