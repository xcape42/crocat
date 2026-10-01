import { colors } from '@/src/theme/tokens';

export const DRAWING_PALETTE = [
  { key: 'ink', label: 'Ink', color: colors.ink },
  { key: 'coral', label: 'Coral', color: '#DB5C46' },
  { key: 'blue', label: 'Blue', color: '#477A91' },
  { key: 'green', label: 'Green', color: '#6A8E3A' },
  { key: 'yellow', label: 'Yellow', color: '#C59A24' },
  { key: 'violet', label: 'Violet', color: '#7556A3' },
] as const;

export const DRAWING_BRUSHES = [
  { key: 'thin', label: 'Thin', width: 3 },
  { key: 'normal', label: 'Normal', width: 6 },
  { key: 'thick', label: 'Thick', width: 10 },
] as const;

export const DEFAULT_DRAWING_COLOR = DRAWING_PALETTE[0].color;
export const DEFAULT_DRAWING_BRUSH_WIDTH: number = DRAWING_BRUSHES[1].width;
