import { create } from 'zustand';
import type { ProfileThemeKey } from '@/src/features/profile/types';

type UiThemeState = {
  themeKey: ProfileThemeKey;
  setThemeKey: (themeKey: ProfileThemeKey) => void;
};

export const useUiThemeStore = create<UiThemeState>((set) => ({
  themeKey: 'paper',
  setThemeKey: (themeKey) => set({ themeKey }),
}));
