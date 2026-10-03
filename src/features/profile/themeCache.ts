import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CrocatWorldKey, ProfileThemeKey } from '@/src/features/profile/types';
import { normalizeWorldKey } from '@/src/theme/worlds';

const WORLD_CACHE_KEY = 'crocat:world-theme:v1';

function isKnownThemeKey(value: string): value is ProfileThemeKey {
  return value === 'moss'
    || value === 'moon'
    || value === 'candy'
    || value === 'halo'
    || value === 'ember'
    || value === 'shadow'
    || value === 'royal'
    || value === 'paper'
    || value === 'ink';
}

export async function loadCachedWorldKey(): Promise<CrocatWorldKey | null> {
  try {
    const value = await AsyncStorage.getItem(WORLD_CACHE_KEY);
    return value && isKnownThemeKey(value) ? normalizeWorldKey(value) : null;
  } catch {
    return null;
  }
}

export async function rememberWorldKey(themeKey: ProfileThemeKey) {
  try {
    await AsyncStorage.setItem(WORLD_CACHE_KEY, normalizeWorldKey(themeKey));
  } catch {
    // The cache only removes bootstrap flashes; the server profile remains authoritative.
  }
}
