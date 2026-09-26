import type { CrocatDrawing, GameRole } from '@/src/types/game';

export type OnlineRoomStatus = 'waiting' | 'drawing' | 'reveal' | 'finished';

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
  status: 'drawing' | 'reveal' | 'finished';
  started_at: string;
  ends_at: string;
  revealed_at: string | null;
};

export type OnlineSubmission = {
  id: string;
  round_id: string;
  player_id: string;
  role: GameRole;
  drawing: CrocatDrawing;
  created_at: string;
};

export type RoomTicket = {
  roomId: string;
  code: string;
  role: GameRole;
};
