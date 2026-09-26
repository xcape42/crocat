import type { GamePhase, GameRole } from '@/src/types/game';

export type GameMode = {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  defaultDuration: number;
  roles: GameRole[];
  phases: GamePhase[];
};

export const splitMode: GameMode = {
  id: 'split',
  name: 'Split',
  minPlayers: 2,
  maxPlayers: 2,
  defaultDuration: 180,
  roles: ['HEAD', 'BODY'],
  phases: ['LOBBY', 'DRAWING', 'HANDOFF', 'DRAWING', 'REVEAL', 'FINALIZE', 'RESULT'],
};
