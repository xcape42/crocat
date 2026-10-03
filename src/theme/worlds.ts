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
    fragments: readonly string[];
    falling: readonly string[];
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
    background: {
      glyphs: ['❧', '✦', '·'],
      fragments: ['❧', '❦', '⌁', '✦', '·'],
      falling: ['❧', '❦', '❧'],
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
      primary: crocatPalette.moon,
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
    background: {
      glyphs: ['✦', '☾', '·'],
      fragments: ['✦', '✧', '☾', '◌', '·'],
      falling: ['✦', '✧', '·'],
    },
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
      primary: crocatPalette.candy,
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
    background: {
      glyphs: ['●', '✦', '○'],
      fragments: ['●', '○', '◆', '✦', '·'],
      falling: ['●', '○', '◆'],
    },
    motion: { ambientMs: 7600, floatDistance: 4, rotateDegrees: 2.5 },
    canvas: { cornerGlyphs: ['●', '○'] },
  },
  halo: {
    key: 'halo',
    label: 'HALO CLOUD',
    shortLabel: 'HALO',
    description: 'Powder-blue skies, soft white clouds and tiny dreamy sparkles.',
    colors: {
      background: '#EAF6FF',
      surface: '#F9FDFF',
      card: crocatPalette.white,
      primary: '#BFE3F7',
      secondary: '#DDEFFF',
      accent: '#F0D8E7',
      text: '#274052',
      muted: '#718A9A',
      line: '#CFE2EE',
      canvas: crocatPalette.haloWhite,
      pattern: '#9FCFEA',
    },
    shapes: {
      cardRadius: 36,
      buttonRadius: 999,
      canvasRadius: 34,
      borderWidth: 2,
      organicCards: true,
    },
    background: {
      glyphs: ['☁', '✦', '○'],
      fragments: ['☁', '✦', '○', '♡', '·'],
      falling: ['☁', '✦', '♡'],
    },
    motion: { ambientMs: 11200, floatDistance: 6, rotateDegrees: 1 },
    canvas: { cornerGlyphs: ['☁', '✦'] },
  },
  ember: {
    key: 'ember',
    label: 'VAMPIRE BLOOD',
    shortLabel: 'BLOOD',
    description: 'Blood red, black velvet and sharp white highlights after dark.',
    colors: {
      background: '#120B0D',
      surface: '#1D1115',
      card: '#261318',
      primary: crocatPalette.emberWorld,
      secondary: '#F4E9E9',
      accent: '#E32442',
      text: '#FFF8F8',
      muted: '#C8AEB3',
      line: '#5A2630',
      canvas: '#FFF9F9',
      pattern: '#7A0E22',
    },
    shapes: {
      cardRadius: 24,
      buttonRadius: 18,
      canvasRadius: 24,
      borderWidth: 2,
      organicCards: false,
    },
    background: {
      glyphs: ['†', '☾', '♦'],
      fragments: ['†', '☾', '♦', '✦', '◇'],
      falling: ['♦', '†', '☾'],
    },
    motion: { ambientMs: 8200, floatDistance: 4, rotateDegrees: 2 },
    canvas: { cornerGlyphs: ['†', '♦'] },
  },
  shadow: {
    key: 'shadow',
    label: 'COLORFUL SHADOW',
    shortLabel: 'SHADOW',
    description: 'Near-black night, rich violet accents and a cool smoky edge.',
    colors: {
      background: '#0E0B12',
      surface: crocatPalette.shadowSurface,
      card: crocatPalette.shadowCard,
      primary: crocatPalette.shadowViolet,
      secondary: '#332A3D',
      accent: crocatPalette.shadowLilac,
      text: '#F8F4FA',
      muted: '#AAA1B2',
      line: crocatPalette.shadowLine,
      canvas: '#FAF8FC',
      pattern: crocatPalette.shadowGray,
    },
    shapes: {
      cardRadius: 30,
      buttonRadius: 22,
      canvasRadius: 28,
      borderWidth: 2,
      organicCards: false,
    },
    background: {
      glyphs: ['☾', '✦', '◆'],
      fragments: ['☾', '✦', '◆', '✧', '♡'],
      falling: ['✦', '◆', '☾', '✧'],
    },
    motion: { ambientMs: 8800, floatDistance: 5, rotateDegrees: 2.2 },
    canvas: { cornerGlyphs: ['☾', '✦'] },
  },
  royal: {
    key: 'royal',
    label: 'ROYAL GEM',
    shortLabel: 'ROYAL',
    description: 'Polished gold, diamond light and saturated jewel-tone accents.',
    colors: {
      background: crocatPalette.royalNavy,
      surface: crocatPalette.royalSurface,
      card: crocatPalette.royalCard,
      primary: crocatPalette.royalGold,
      secondary: crocatPalette.royalSapphire,
      accent: crocatPalette.royalRuby,
      text: crocatPalette.royalDiamond,
      muted: '#C8D0DF',
      line: crocatPalette.royalLine,
      canvas: '#FFFDF7',
      pattern: crocatPalette.royalEmerald,
    },
    shapes: {
      cardRadius: 26,
      buttonRadius: 18,
      canvasRadius: 24,
      borderWidth: 2,
      organicCards: false,
    },
    background: {
      glyphs: ['◆', '✦', '◇'],
      fragments: ['◆', '◇', '✦', '⬟', '·'],
      falling: ['◆', '◇', '✦'],
    },
    motion: { ambientMs: 9400, floatDistance: 4.5, rotateDegrees: 1.6 },
    canvas: { cornerGlyphs: ['◆', '✦'] },
  },
};

export const WORLD_OPTIONS = Object.values(CROCAT_WORLDS);

export function normalizeWorldKey(key?: ProfileThemeKey | null): CrocatWorldKey {
  if (key === 'moon' || key === 'ink') return 'moon';
  if (key === 'candy') return 'candy';
  if (key === 'halo') return 'halo';
  if (key === 'ember') return 'ember';
  if (key === 'shadow') return 'shadow';
  if (key === 'royal') return 'royal';
  return 'moss';
}

export function crocatWorld(key?: ProfileThemeKey | null): CrocatWorld {
  return CROCAT_WORLDS[normalizeWorldKey(key)];
}
