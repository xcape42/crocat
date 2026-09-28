import type { ProfileThemeKey } from '@/src/features/profile/types';
import { crocatWorld } from '@/src/theme/worlds';

export type CrocatUiTheme = {
  key: ProfileThemeKey;
  label: string;
  background: string;
  surface: string;
  primary: string;
  accent: string;
  line: string;
  pattern: string;
  patternGlyph: string;
  patternAlt: string;
};

export function crocatUiTheme(key: ProfileThemeKey): CrocatUiTheme {
  const world = crocatWorld(key);
  return {
    key,
    label: world.label,
    background: world.colors.background,
    surface: world.colors.surface,
    primary: world.colors.primary,
    accent: world.colors.accent,
    line: world.colors.line,
    pattern: world.colors.pattern,
    patternGlyph: world.background.glyphs[0],
    patternAlt: world.background.glyphs[1],
  };
}
