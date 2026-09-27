import type { ProfileThemeKey } from '@/src/features/profile/types';
import { colors } from '@/src/theme/tokens';

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

export const CROCAT_UI_THEMES: Record<ProfileThemeKey, CrocatUiTheme> = {
  paper: {
    key: 'paper',
    label: 'PAPER',
    background: colors.paper,
    surface: colors.card,
    primary: colors.lime,
    accent: colors.coral,
    line: colors.line,
    pattern: '#D8CCB9',
    patternGlyph: '·',
    patternAlt: '—',
  },
  ink: {
    key: 'ink',
    label: 'INK',
    background: '#E8EFEC',
    surface: '#F7FBF9',
    primary: colors.blue,
    accent: '#C8B7E8',
    line: '#BBC9C2',
    pattern: '#8FA69C',
    patternGlyph: '✦',
    patternAlt: '╱',
  },
};

export function crocatUiTheme(key: ProfileThemeKey) {
  return CROCAT_UI_THEMES[key] ?? CROCAT_UI_THEMES.paper;
}
