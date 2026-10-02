import { crocatPalette } from '@/src/theme/palette';

export const DRAWING_PALETTE = [
  { key: 'ink', label: 'Ink', color: crocatPalette.ink },
  { key: 'coral', label: 'Coral', color: crocatPalette.coral },
  { key: 'moss', label: 'Moss', color: crocatPalette.moss },
  { key: 'sky', label: 'Sky', color: crocatPalette.sky },
  { key: 'lavender', label: 'Lavender', color: crocatPalette.lavender },
  { key: 'gold', label: 'Gold', color: crocatPalette.gold },
  { key: 'berry', label: 'Berry', color: crocatPalette.berry },
  { key: 'plum', label: 'Plum', color: crocatPalette.plum },
] as const;

export const DRAWING_BRUSHES = [
  { key: 'thin', label: 'Thin', width: 3 },
  { key: 'normal', label: 'Normal', width: 6 },
  { key: 'thick', label: 'Thick', width: 10 },
] as const;

export const DEFAULT_DRAWING_COLOR = DRAWING_PALETTE[0].color;
export const DEFAULT_DRAWING_BRUSH_WIDTH: number = DRAWING_BRUSHES[1].width;
