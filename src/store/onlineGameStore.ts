import { create } from 'zustand';
import type { GameRole } from '@/src/types/game';
import type { OnlinePlayer, OnlineRoom, OnlineRound } from '@/src/features/multiplayer/types';

type OnlineState = {
  displayName: string;
  userId: string | null;
  role: GameRole | null;
  room: OnlineRoom | null;
  players: OnlinePlayer[];
  round: OnlineRound | null;
  onlineUserIds: string[];
  setDisplayName: (name: string) => void;
  setIdentity: (userId: string, role?: GameRole | null) => void;
  setRoomState: (room: OnlineRoom, players: OnlinePlayer[], round: OnlineRound | null) => void;
  setOnlineUserIds: (ids: string[]) => void;
  reset: () => void;
};

export const useOnlineGameStore = create<OnlineState>((set) => ({
  displayName: '',
  userId: null,
  role: null,
  room: null,
  players: [],
  round: null,
  onlineUserIds: [],
  setDisplayName: (displayName) => set({ displayName }),
  setIdentity: (userId, role = null) => set({ userId, role }),
  setRoomState: (room, players, round) => set({ room, players, round }),
  setOnlineUserIds: (onlineUserIds) => set({ onlineUserIds }),
  reset: () => set({
    userId: null,
    role: null,
    room: null,
    players: [],
    round: null,
    onlineUserIds: [],
  }),
}));
