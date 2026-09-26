import type { CrocatDrawing, GameRole, PartTransform } from '@/src/types/game';

export type OnlineRoomStatus =
  | 'waiting'
  | 'drawing'
  | 'adjusting'
  | 'final_reveal'
  | 'reveal'
  | 'finished';

export type OnlineRoom = {
  id: string;
  code: string;
  host_id: string;
  game_mode: string;
  status: OnlineRoomStatus;
  round_seconds: number;
  next_round_at: string | null;
  created_at: string;
};

export type OnlinePlayer = {
  room_id: string;
  user_id: string;
  display_name: string;
  role: GameRole;
  ready: boolean;
  joined_at: string;
};

export type OnlineRound = {
  id: string;
  room_id: string;
  status: 'drawing' | 'adjusting' | 'final_reveal' | 'reveal' | 'finished';
  started_at: string;
  ends_at: string;
  revealed_at: string | null;
  adjustment_ends_at: string | null;
  final_reveal_ends_at: string | null;
};

export type OnlineSubmission = {
  id: string;
  round_id: string;
  player_id: string;
  role: GameRole;
  drawing: CrocatDrawing;
  transform: PartTransform;
  created_at: string;
};

export type RoomTicket = {
  roomId: string;
  code: string;
  role: GameRole;
};
