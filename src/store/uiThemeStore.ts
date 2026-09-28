import { create } from 'zustand';
import { rememberWorldKey } from '@/src/features/profile/themeCache';
import type { CrocatWorldKey, ProfileThemeKey } from '@/src/features/profile/types';
import { normalizeWorldKey } from '@/src/theme/worlds';

type SetThemeOptions = {
  persist?: boolean;
};

type UiThemeState = {
  themeKey: CrocatWorldKey;
  themeReady: boolean;
  themeRevision: number;
  setThemeKey: (themeKey: ProfileThemeKey, options?: SetThemeOptions) => void;
};

export const useUiThemeStore = create<UiThemeState>((set) => ({
  // This value is deliberately not considered render-ready until bootstrap resolves.
  themeKey: 'moss',
  themeReady: false,
  themeRevision: 0,
  setThemeKey: (themeKey, options) => {
    const worldKey = normalizeWorldKey(themeKey);

    set((state) => ({
      themeKey: worldKey,
      themeReady: true,
      themeRevision: state.themeRevision + 1,
    }));

    if (options?.persist !== false) {
      void rememberWorldKey(worldKey);
    }
  },
}));
