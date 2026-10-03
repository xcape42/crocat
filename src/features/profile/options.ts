import {
  MASCOT_CHARACTER_OPTIONS,
  MASCOT_COLOR_OPTIONS,
  MASCOT_SHAPE_OPTIONS,
  MASCOT_SYMBOL_OPTIONS,
} from '@/src/theme/mascots';
import { WORLD_OPTIONS } from '@/src/theme/worlds';
import type { ProfileThemeKey } from './types';

export const MASCOT_COLORS = MASCOT_COLOR_OPTIONS;
export const MASCOT_SHAPES = MASCOT_SHAPE_OPTIONS;
export const MASCOT_CHARACTERS = MASCOT_CHARACTER_OPTIONS;
export const MASCOT_SYMBOLS = MASCOT_SYMBOL_OPTIONS;

export const PROFILE_THEMES: Array<{
  key: ProfileThemeKey;
  label: string;
  description: string;
  background: string;
  accent: string;
  pattern: string;
  text: string;
  muted: string;
  line: string;
}> = WORLD_OPTIONS.map((world) => ({
  key: world.key,
  label: world.label,
  description: world.description,
  background: world.colors.background,
  accent: world.colors.accent,
  pattern: world.background.glyphs.join('  '),
  text: world.colors.text,
  muted: world.colors.muted,
  line: world.colors.line,
}));
