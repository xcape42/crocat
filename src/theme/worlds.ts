import type { CrocatWorldKey, ProfileThemeKey } from '@/src/features/profile/types';

export type MascotState =
  | 'idle'
  | 'happy'
  | 'waiting'
  | 'drawing'
  | 'nervous'
  | 'celebrate'
  | 'sleeping';

export type CrocatWorld = {
  key: CrocatWorldKey;
  label: string;
  shortLabel: string;
  description: string;
  colors: {
    background: string;
    surface: string;
    card: string;
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    muted: string;
    line: string;
    canvas: string;
    pattern: string;
  };
  shapes: {
    cardRadius: number;
    buttonRadius: number;
    canvasRadius: number;
    borderWidth: number;
    organicCards: boolean;
  };
  background: {
    glyphs: readonly [string, string, string];
  };
  mascot: {
    name: string;
    fill: string;
    secondary: string;
    accessory: string;
    faces: Record<MascotState, string>;
  };
  motion: {
    ambientMs: number;
    floatDistance: number;
    rotateDegrees: number;
  };
  canvas: {
    cornerGlyphs: readonly [string, string];
  };
};

const sharedFaces: Record<MascotState, string> = {
  idle: '• ᴗ •',
  happy: '˶ᵔ ᵕ ᵔ˶',
  waiting: '• ︵ •',
  drawing: '• ω •',
  nervous: '◉﹏◉',
  celebrate: '★ ᴗ ★',
  sleeping: '− ᴗ −',
};

export const CROCAT_WORLDS: Record<CrocatWorldKey, CrocatWorld> = {
  moss: {
    key: 'moss',
    label: 'MOSS GARDEN',
    shortLabel: 'MOSS',
    description: 'Warm leaves, soft paper and a tiny forest friend.',
    colors: {
      background: '#F3F0E2',
      surface: '#FFFDF7',
      card: '#FFFDF8',
      primary: '#BBD68A',
      secondary: '#DCE9C3',
      accent: '#FF8B73',
      text: '#17221D',
      muted: '#65736B',
      line: '#D5CEBD',
      canvas: '#FFFDF8',
      pattern: '#B9AE94',
    },
    shapes: {
      cardRadius: 30,
      buttonRadius: 999,
      canvasRadius: 30,
      borderWidth: 2,
      organicCards: true,
    },
    background: { glyphs: ['❧', '✦', '·'] },
    mascot: {
      name: 'Mossy',
      fill: '#BBD68A',
      secondary: '#E5EECF',
      accessory: '❧',
      faces: sharedFaces,
    },
    motion: { ambientMs: 9000, floatDistance: 5, rotateDegrees: 2 },
    canvas: { cornerGlyphs: ['❧', '·'] },
  },
  moon: {
    key: 'moon',
    label: 'MOON MILK',
    shortLabel: 'MOON',
    description: 'Lavender dusk, sleepy stars and soft lunar glow.',
    colors: {
      background: '#EBEAF7',
      surface: '#F8F6FF',
      card: '#FCFAFF',
      primary: '#B9B8E9',
      secondary: '#D9D5F5',
      accent: '#F0B86E',
      text: '#26243A',
      muted: '#6C6881',
      line: '#CEC9E0',
      canvas: '#FFFCF4',
      pattern: '#9A95BC',
    },
    shapes: {
      cardRadius: 34,
      buttonRadius: 24,
      canvasRadius: 32,
      borderWidth: 2,
      organicCards: false,
    },
    background: { glyphs: ['✦', '☾', '·'] },
    mascot: {
      name: 'Luma',
      fill: '#C9C7F2',
      secondary: '#F4E9BE',
      accessory: '☾',
      faces: sharedFaces,
    },
    motion: { ambientMs: 10500, floatDistance: 6, rotateDegrees: 1.5 },
    canvas: { cornerGlyphs: ['✦', '☾'] },
  },
  candy: {
    key: 'candy',
    label: 'CANDY BLOB',
    shortLabel: 'CANDY',
    description: 'Peachy blobs, tiny confetti and a bouncy little pal.',
    colors: {
      background: '#FFF0EA',
      surface: '#FFF8F4',
      card: '#FFFCFA',
      primary: '#FFB49E',
      secondary: '#FFD5A8',
      accent: '#E98AC2',
      text: '#3A2430',
      muted: '#80666E',
      line: '#E7C6BC',
      canvas: '#FFFDFC',
      pattern: '#D797A5',
    },
    shapes: {
      cardRadius: 36,
      buttonRadius: 30,
      canvasRadius: 28,
      borderWidth: 2,
      organicCards: true,
    },
    background: { glyphs: ['●', '✦', '○'] },
    mascot: {
      name: 'Bloop',
      fill: '#FFB49E',
      secondary: '#FFD5A8',
      accessory: '✦',
      faces: sharedFaces,
    },
    motion: { ambientMs: 7600, floatDistance: 4, rotateDegrees: 2.5 },
    canvas: { cornerGlyphs: ['●', '○'] },
  },
};

export const WORLD_OPTIONS = Object.values(CROCAT_WORLDS);

export function normalizeWorldKey(key?: ProfileThemeKey | null): CrocatWorldKey {
  if (key === 'moon' || key === 'ink') return 'moon';
  if (key === 'candy') return 'candy';
  return 'moss';
}

export function crocatWorld(key?: ProfileThemeKey | null): CrocatWorld {
  return CROCAT_WORLDS[normalizeWorldKey(key)];
}
