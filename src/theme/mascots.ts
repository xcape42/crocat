import type {
  MascotCharacterKey,
  MascotShapeKey,
  ProfileColorKey,
  ProfileSymbolKey,
  ProfileThemeKey,
} from '@/src/features/profile/types';
import { crocatPalette } from '@/src/theme/palette';

export type MascotState =
  | 'idle'
  | 'happy'
  | 'shy'
  | 'curious'
  | 'waiting'
  | 'drawing'
  | 'nervous'
  | 'excited'
  | 'proud'
  | 'celebrate'
  | 'sleeping';

export type MascotIdleStyle = 'sway' | 'float' | 'bounce';
export type MascotIdleExpression = 'blink' | 'left' | 'right';

export type MascotCharacter = {
  key: MascotCharacterKey;
  label: string;
  description: string;
  faces: Record<MascotState, string>;
  idle: {
    style: MascotIdleStyle;
    expressionMinMs: number;
    expressionMaxMs: number;
    gazeMs: number;
    sequence: readonly MascotIdleExpression[];
  };
  motion: {
    ambientMs: number;
    floatDistance: number;
    rotateDegrees: number;
  };
};

const gentleFaces: Record<MascotState, string> = {
  idle: '• ᴗ •',
  happy: 'ᵔ ᴗ ᵔ',
  shy: '◦ ᴗ ◦',
  curious: '◉ ᵕ ◉',
  waiting: '• ᴗ •',
  drawing: '• ω •',
  nervous: '◉ ᴗ ◉',
  excited: '✦ ᴗ ✦',
  proud: '˘ ᴗ ˘',
  celebrate: '★ ᴗ ★',
  sleeping: '− ᴗ −',
};

const dreamyFaces: Record<MascotState, string> = {
  idle: '◌ ᴗ ◌',
  happy: 'ᵔ ᵕ ᵔ',
  shy: '◌ ᴗ ◌',
  curious: '◌ ᵕ ◌',
  waiting: '• ᴗ •',
  drawing: '◌ ω ◌',
  nervous: '◉ ᵕ ◉',
  excited: '✦ ᵕ ✦',
  proud: '˘ ᵕ ˘',
  celebrate: '✦ ᴗ ✦',
  sleeping: '− ᴗ −',
};

const playfulFaces: Record<MascotState, string> = {
  idle: '• ω •',
  happy: 'ᵔ ω ᵔ',
  shy: '◦ ω ◦',
  curious: '• ᵕ •',
  waiting: '• ᴗ •',
  drawing: '• ω •',
  nervous: '◉ ω ◉',
  excited: '✦ ω ✦',
  proud: '˘ ω ˘',
  celebrate: '★ ω ★',
  sleeping: '− ᴗ −',
};

export const MASCOT_CHARACTERS: Record<MascotCharacterKey, MascotCharacter> = {
  gentle: {
    key: 'gentle',
    label: 'GENTLE',
    description: 'Calm, warm and a little shy.',
    faces: gentleFaces,
    idle: {
      style: 'sway',
      expressionMinMs: 5200,
      expressionMaxMs: 8200,
      gazeMs: 620,
      sequence: ['blink', 'left', 'blink', 'right', 'blink'],
    },
    motion: { ambientMs: 9000, floatDistance: 5, rotateDegrees: 2 },
  },
  dreamy: {
    key: 'dreamy',
    label: 'DREAMY',
    description: 'Curious, soft and slightly spacey.',
    faces: dreamyFaces,
    idle: {
      style: 'float',
      expressionMinMs: 6000,
      expressionMaxMs: 9200,
      gazeMs: 820,
      sequence: ['left', 'blink', 'right', 'blink'],
    },
    motion: { ambientMs: 10500, floatDistance: 6, rotateDegrees: 1.5 },
  },
  playful: {
    key: 'playful',
    label: 'PLAYFUL',
    description: 'Bouncy, bright and a little cheeky.',
    faces: playfulFaces,
    idle: {
      style: 'bounce',
      expressionMinMs: 3800,
      expressionMaxMs: 6500,
      gazeMs: 460,
      sequence: ['right', 'blink', 'left', 'right', 'blink'],
    },
    motion: { ambientMs: 7600, floatDistance: 4, rotateDegrees: 2.5 },
  },
};

export const MASCOT_COLOR_OPTIONS: Array<{
  key: ProfileColorKey;
  label: string;
  hex: string;
}> = [
  { key: 'moss', label: 'MOSS', hex: crocatPalette.mossSoft },
  { key: 'lime', label: 'LIME', hex: crocatPalette.lime },
  { key: 'coral', label: 'CORAL', hex: crocatPalette.coralSoft },
  { key: 'blue', label: 'SKY', hex: crocatPalette.skySoft },
  { key: 'violet', label: 'LAVENDER', hex: crocatPalette.lavenderSoft },
  { key: 'peach', label: 'PEACH', hex: crocatPalette.peach },
  { key: 'mint', label: 'MINT', hex: crocatPalette.mint },
];

export const MASCOT_SHAPE_OPTIONS: Array<{
  key: MascotShapeKey;
  label: string;
}> = [
  { key: 'round', label: 'ROUND' },
  { key: 'ears', label: 'SOFT' },
  { key: 'spiky', label: 'WOBBLY' },
];

export const MASCOT_SYMBOL_OPTIONS: Array<{
  key: ProfileSymbolKey;
  label: string;
  glyph: string;
}> = [
  { key: 'star', label: 'STAR', glyph: '★' },
  { key: 'spark', label: 'SPARK', glyph: '✦' },
  { key: 'heart', label: 'HEART', glyph: '♥' },
  { key: 'moon', label: 'MOON', glyph: '☾' },
  { key: 'bolt', label: 'BOLT', glyph: 'ϟ' },
];

export const MASCOT_CHARACTER_OPTIONS = Object.values(MASCOT_CHARACTERS);

export function mascotColor(key?: ProfileColorKey | null) {
  return MASCOT_COLOR_OPTIONS.find((item) => item.key === key)?.hex
    ?? crocatPalette.mossSoft;
}

export function mascotSymbol(key?: ProfileSymbolKey | null) {
  return MASCOT_SYMBOL_OPTIONS.find((item) => item.key === key)?.glyph
    ?? MASCOT_SYMBOL_OPTIONS[0].glyph;
}

export function mascotCharacter(key?: MascotCharacterKey | null) {
  return MASCOT_CHARACTERS[key ?? 'gentle'] ?? MASCOT_CHARACTERS.gentle;
}

export function legacyMascotCharacterForTheme(
  themeKey?: ProfileThemeKey | null,
): MascotCharacterKey {
  if (themeKey === 'moon' || themeKey === 'ink') return 'dreamy';
  if (themeKey === 'candy') return 'playful';
  return 'gentle';
}
