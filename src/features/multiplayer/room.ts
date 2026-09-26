import type { CrocatDrawing, GameRole } from '@/src/types/game';
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

export async function loadRoom(code: string) {
  const supabase = requireSupabase();
  const roomResult = await supabase.from('rooms').select('*').eq('code', code.toUpperCase()).single();
  if (roomResult.error) throw roomResult.error;

  const room = roomResult.data as OnlineRoom;
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

export async function loadSubmissions(roundId: string): Promise<OnlineSubmission[]> {
  const { data, error } = await requireSupabase()
    .from('submissions')
    .select('*')
    .eq('round_id', roundId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as OnlineSubmission[];
}
