import { create } from 'zustand';
import { clampArtworkTransform } from '@/src/features/artworks/geometry';
import type { CrocatDrawing, GamePhase, GameRole, PartTransform } from '@/src/types/game';

const emptyDrawing = (): CrocatDrawing => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  strokes: [],
});

const defaultTransform: PartTransform = { x: 0, y: 0, scale: 1 };

type GameState = {
  phase: GamePhase;
  roomCode: string;
  roundSeconds: number;
  currentRole: GameRole;
  head: CrocatDrawing | null;
  body: CrocatDrawing | null;
  headTransform: PartTransform;
  bodyTransform: PartTransform;
  startRound: () => void;
  submitDrawing: (drawing: CrocatDrawing) => GameRole | 'DONE';
  setPhase: (phase: GamePhase) => void;
  nudgePart: (role: GameRole, dx: number, dy: number) => void;
  scalePart: (role: GameRole, delta: number) => void;
  resetRound: () => void;
  setRoundSeconds: (seconds: number) => void;
  makeBlankDrawing: () => CrocatDrawing;
};

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'HOME',
  roomCode: 'CROC',
  roundSeconds: 180,
  currentRole: 'HEAD',
  head: null,
  body: null,
  headTransform: { ...defaultTransform },
  bodyTransform: { ...defaultTransform },

  startRound: () => set({
    phase: 'DRAWING',
    currentRole: 'HEAD',
    head: null,
    body: null,
    headTransform: { ...defaultTransform },
    bodyTransform: { ...defaultTransform },
  }),

  submitDrawing: (drawing) => {
    const role = get().currentRole;
    if (role === 'HEAD') {
      set({ head: drawing, currentRole: 'BODY', phase: 'HANDOFF' });
      return 'BODY';
    }
    set({ body: drawing, phase: 'REVEAL' });
    return 'DONE';
  },

  setPhase: (phase) => set({ phase }),

  nudgePart: (role, dx, dy) => set((state) => {
    const key = role === 'HEAD' ? 'headTransform' : 'bodyTransform';
    const next = clampArtworkTransform({
      ...state[key],
      x: state[key].x + dx,
      y: state[key].y + dy,
    });
    return { [key]: next } as Partial<GameState>;
  }),

  scalePart: (role, delta) => set((state) => {
    const key = role === 'HEAD' ? 'headTransform' : 'bodyTransform';
    const next = clampArtworkTransform({
      ...state[key],
      scale: state[key].scale + delta,
    });
    return { [key]: next } as Partial<GameState>;
  }),

  resetRound: () => set({
    phase: 'LOBBY',
    currentRole: 'HEAD',
    head: null,
    body: null,
    headTransform: { ...defaultTransform },
    bodyTransform: { ...defaultTransform },
  }),

  setRoundSeconds: (roundSeconds) => set({ roundSeconds }),
  makeBlankDrawing: emptyDrawing,
}));
