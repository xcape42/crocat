export type GameRole = 'HEAD' | 'BODY';
export type GamePhase = 'HOME' | 'LOBBY' | 'DRAWING' | 'HANDOFF' | 'REVEAL' | 'FINALIZE' | 'RESULT';

export type Point = {
  x: number;
  y: number;
};

export type Stroke = {
  id: string;
  points: Point[];
  color: string;
  width: number;
  opacity: number;
};

export type CrocatDrawing = {
  id: string;
  strokes: Stroke[];
};

export type PartTransform = {
  x: number;
  y: number;
  scale: number;
};
