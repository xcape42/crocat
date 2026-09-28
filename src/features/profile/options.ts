import { colors } from '@/src/theme/tokens';
import { WORLD_OPTIONS } from '@/src/theme/worlds';
import type {
  ProfileAvatarKey,
  ProfileColorKey,
  ProfileSymbolKey,
  ProfileThemeKey,
} from './types';

export const PROFILE_COLORS: Array<{ key: ProfileColorKey; label: string; hex: string }> = [
  { key: 'moss', label: 'MOSS', hex: colors.moss },
  { key: 'lime', label: 'LIME', hex: colors.lime },
  { key: 'coral', label: 'CORAL', hex: colors.coral },
  { key: 'blue', label: 'BLUE', hex: colors.blue },
  { key: 'violet', label: 'VIOLET', hex: '#C8B7E8' },
  { key: 'peach', label: 'PEACH', hex: '#F1B98F' },
  { key: 'mint', label: 'MINT', hex: '#9FD8C2' },
];

export const PROFILE_AVATARS: Array<{ key: ProfileAvatarKey; label: string; face: string }> = [
  { key: 'round', label: 'ROUND', face: '◉ ᴗ ◉' },
  { key: 'ears', label: 'EARS', face: 'ᵔᴥᵔ' },
  { key: 'spiky', label: 'SPIKY', face: '✦ᴗ✦' },
];

export const PROFILE_THEMES: Array<{
  key: ProfileThemeKey;
  label: string;
  description: string;
  background: string;
  accent: string;
  pattern: string;
}> = WORLD_OPTIONS.map((world) => ({
  key: world.key,
  label: world.label,
  description: world.description,
  background: world.colors.background,
  accent: world.colors.accent,
  pattern: world.background.glyphs.join('  '),
}));

export const PROFILE_SYMBOLS: Array<{ key: ProfileSymbolKey; label: string; glyph: string }> = [
  { key: 'star', label: 'STAR', glyph: '★' },
  { key: 'spark', label: 'SPARK', glyph: '✦' },
  { key: 'heart', label: 'HEART', glyph: '♥' },
  { key: 'moon', label: 'MOON', glyph: '☾' },
  { key: 'bolt', label: 'BOLT', glyph: 'ϟ' },
];

export function profileColor(key: ProfileColorKey) {
  return PROFILE_COLORS.find((item) => item.key === key)?.hex ?? colors.moss;
}

export function profileFace(key: ProfileAvatarKey) {
  return PROFILE_AVATARS.find((item) => item.key === key)?.face ?? PROFILE_AVATARS[0].face;
}

export function profileSymbol(key: ProfileSymbolKey) {
  return PROFILE_SYMBOLS.find((item) => item.key === key)?.glyph ?? PROFILE_SYMBOLS[0].glyph;
}
