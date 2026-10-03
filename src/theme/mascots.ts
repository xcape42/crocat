import type {
  CrocatWorldKey,
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
  traits: readonly string[];
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

export type MascotColorOption = {
  key: ProfileColorKey;
  label: string;
  hex: string;
  ink: string;
  worldKey?: CrocatWorldKey;
  worldLabel?: string;
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

const sunnyFaces: Record<MascotState, string> = {
  idle: '• ◡ •',
  happy: 'ᵔ ◡ ᵔ',
  shy: '◦ ◡ ◦',
  curious: '◉ ◡ •',
  waiting: '• ◡ •',
  drawing: '• ▿ •',
  nervous: '◉ ◡ ◉',
  excited: '✦ ◡ ✦',
  proud: '˘ ◡ ˘',
  celebrate: '★ ◡ ★',
  sleeping: '− ◡ −',
};

const coolFaces: Record<MascotState, string> = {
  idle: '• ‿ •',
  happy: 'ᵔ ‿ ᵔ',
  shy: '◦ ‿ ◦',
  curious: '◉ ‿ •',
  waiting: '• ‿ •',
  drawing: '• ᴗ •',
  nervous: '◉ ‿ ◉',
  excited: '✦ ‿ ✦',
  proud: '˘ ‿ ˘',
  celebrate: '★ ‿ ★',
  sleeping: '− ‿ −',
};

export const MASCOT_CHARACTERS: Record<MascotCharacterKey, MascotCharacter> = {
  gentle: {
    key: 'gentle',
    label: 'GENTLE',
    description: 'Calm, warm and a little shy.',
    traits: ['CALM', 'WARM', 'SHY'],
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
    traits: ['DREAMY', 'CURIOUS', 'SOFT'],
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
    traits: ['PLAYFUL', 'BRIGHT', 'CHEEKY'],
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
  sunny: {
    key: 'sunny',
    label: 'SUNNY',
    description: 'Open, cheerful and quietly enthusiastic.',
    traits: ['SUNNY', 'OPEN', 'CHEERFUL'],
    faces: sunnyFaces,
    idle: {
      style: 'bounce',
      expressionMinMs: 4600,
      expressionMaxMs: 7400,
      gazeMs: 520,
      sequence: ['blink', 'right', 'left', 'blink', 'right'],
    },
    motion: { ambientMs: 8200, floatDistance: 4.5, rotateDegrees: 2.2 },
  },
  cool: {
    key: 'cool',
    label: 'COOL',
    description: 'Relaxed, confident and softly amused.',
    traits: ['RELAXED', 'COOL', 'CONFIDENT'],
    faces: coolFaces,
    idle: {
      style: 'float',
      expressionMinMs: 5600,
      expressionMaxMs: 8600,
      gazeMs: 760,
      sequence: ['left', 'right', 'blink', 'left'],
    },
    motion: { ambientMs: 9800, floatDistance: 3.8, rotateDegrees: 1.2 },
  },
};

export const MASCOT_COLOR_OPTIONS: MascotColorOption[] = [
  {
    key: 'moss',
    label: 'MOSS',
    hex: crocatPalette.mossSoft,
    ink: crocatPalette.ink,
    worldKey: 'moss',
    worldLabel: 'MOSS',
  },
  {
    key: 'violet',
    label: 'MOON',
    hex: crocatPalette.moon,
    ink: crocatPalette.ink,
    worldKey: 'moon',
    worldLabel: 'MOON',
  },
  {
    key: 'coral',
    label: 'CANDY',
    hex: crocatPalette.candy,
    ink: crocatPalette.ink,
    worldKey: 'candy',
    worldLabel: 'CANDY',
  },
  {
    key: 'halo',
    label: 'HALO',
    hex: crocatPalette.haloWhite,
    ink: crocatPalette.ink,
    worldKey: 'halo',
    worldLabel: 'HALO',
  },
  {
    key: 'ember',
    label: 'EMBER',
    hex: crocatPalette.emberWorld,
    ink: crocatPalette.ink,
    worldKey: 'ember',
    worldLabel: 'EMBER',
  },
  {
    key: 'shadow',
    label: 'SHADOW',
    hex: crocatPalette.shadowInk,
    ink: crocatPalette.haloWhite,
    worldKey: 'shadow',
    worldLabel: 'SHADOW',
  },
  { key: 'blue', label: 'SKY', hex: crocatPalette.skySoft, ink: crocatPalette.ink },
  { key: 'mint', label: 'MINT', hex: crocatPalette.mint, ink: crocatPalette.ink },
  { key: 'peach', label: 'PEACH', hex: crocatPalette.peach, ink: crocatPalette.ink },
  { key: 'lime', label: 'LIME', hex: crocatPalette.lime, ink: crocatPalette.ink },
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

export function mascotColorOption(key?: ProfileColorKey | null) {
  return MASCOT_COLOR_OPTIONS.find((item) => item.key === key)
    ?? MASCOT_COLOR_OPTIONS[0];
}

export function mascotColor(key?: ProfileColorKey | null) {
  return mascotColorOption(key).hex;
}

export function mascotInk(key?: ProfileColorKey | null) {
  return mascotColorOption(key).ink;
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
  if (themeKey === 'halo') return 'sunny';
  if (themeKey === 'ember' || themeKey === 'shadow') return 'cool';
  return 'gentle';
}
