import type { CrocatWorldKey, ProfileThemeKey } from '@/src/features/profile/types';
import { crocatPalette } from '@/src/theme/palette';

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
  motion: {
    ambientMs: number;
    floatDistance: number;
    rotateDegrees: number;
  };
  canvas: {
    cornerGlyphs: readonly [string, string];
  };
};

export const CROCAT_WORLDS: Record<CrocatWorldKey, CrocatWorld> = {
  moss: {
    key: 'moss',
    label: 'MOSS GARDEN',
    shortLabel: 'MOSS',
    description: 'Warm leaves, soft paper and a calm garden atmosphere.',
    colors: {
      background: '#F3F0E2',
      surface: '#FFFDF7',
      card: crocatPalette.cream,
      primary: crocatPalette.mossSoft,
      secondary: crocatPalette.leafSoft,
      accent: crocatPalette.coralSoft,
      text: crocatPalette.ink,
      muted: '#65736B',
      line: '#D5CEBD',
      canvas: crocatPalette.cream,
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
      secondary: crocatPalette.moonSoft,
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
    motion: { ambientMs: 10500, floatDistance: 6, rotateDegrees: 1.5 },
    canvas: { cornerGlyphs: ['✦', '☾'] },
  },
  candy: {
    key: 'candy',
    label: 'CANDY BLOB',
    shortLabel: 'CANDY',
    description: 'Peachy surfaces, tiny confetti and playful warmth.',
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
    motion: { ambientMs: 7600, floatDistance: 4, rotateDegrees: 2.5 },
    canvas: { cornerGlyphs: ['●', '○'] },
  },
  halo: {
    key: 'halo',
    label: 'HALO CLOUD',
    shortLabel: 'HALO',
    description: 'Airy clouds, pale sky and a soft golden glow.',
    colors: {
      background: '#F2F7FB',
      surface: '#FFFEFA',
      card: '#FFFFFF',
      primary: '#D9EAF4',
      secondary: '#FFF0C8',
      accent: crocatPalette.gold,
      text: '#20303A',
      muted: '#6E7C84',
      line: '#D3E0E8',
      canvas: '#FFFDF8',
      pattern: '#AFC8D9',
    },
    shapes: {
      cardRadius: 36,
      buttonRadius: 999,
      canvasRadius: 34,
      borderWidth: 2,
      organicCards: true,
    },
    background: { glyphs: ['✦', '○', '·'] },
    motion: { ambientMs: 11200, floatDistance: 6, rotateDegrees: 1 },
    canvas: { cornerGlyphs: ['✦', '○'] },
  },
  ember: {
    key: 'ember',
    label: 'EMBER VELVET',
    shortLabel: 'EMBER',
    description: 'Dusky plum, warm embers and a cooler night-time edge.',
    colors: {
      background: '#D8CCD7',
      surface: '#EFE6ED',
      card: '#F8F1F5',
      primary: '#C68A9E',
      secondary: '#D9A29A',
      accent: crocatPalette.ember,
      text: '#281A25',
      muted: '#705866',
      line: '#B9A7B4',
      canvas: '#FFF8F5',
      pattern: '#77516E',
    },
    shapes: {
      cardRadius: 28,
      buttonRadius: 20,
      canvasRadius: 26,
      borderWidth: 2,
      organicCards: false,
    },
    background: { glyphs: ['◆', '✦', '·'] },
    motion: { ambientMs: 8200, floatDistance: 4, rotateDegrees: 2 },
    canvas: { cornerGlyphs: ['◆', '✦'] },
  },
};

export const WORLD_OPTIONS = Object.values(CROCAT_WORLDS);

export function normalizeWorldKey(key?: ProfileThemeKey | null): CrocatWorldKey {
  if (key === 'moon' || key === 'ink') return 'moon';
  if (key === 'candy') return 'candy';
  if (key === 'halo') return 'halo';
  if (key === 'ember') return 'ember';
  return 'moss';
}

export function crocatWorld(key?: ProfileThemeKey | null): CrocatWorld {
  return CROCAT_WORLDS[normalizeWorldKey(key)];
}
