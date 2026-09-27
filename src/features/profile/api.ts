import type { User } from '@supabase/supabase-js';
import { ensureGuest } from '@/src/features/multiplayer/auth';
import { requireSupabase } from '@/src/lib/supabase';
import type {
  PlayerProfile,
  ProfileAvatarKey,
  ProfileColorKey,
  ProfileSymbolKey,
  ProfileThemeKey,
} from './types';

function one<T>(data: T | T[] | null): T {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value) throw new Error('Profile data is missing.');
  return value;
}

export async function ensureCurrentProfile(
  fallbackName = 'Crocat',
): Promise<{ user: User; profile: PlayerProfile }> {
  const user = await ensureGuest(fallbackName);
  const defaultName =
    typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name
      : fallbackName;

  const { data, error } = await requireSupabase().rpc('ensure_profile', {
    p_default_name: defaultName,
  });
  if (error) throw error;

  return {
    user,
    profile: one<PlayerProfile>(data),
  };
}

export async function loadCurrentProfile(): Promise<PlayerProfile> {
  const { user, profile } = await ensureCurrentProfile();
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return (data as PlayerProfile | null) ?? profile;
}

export async function updateProfile(input: {
  displayName: string;
  colorKey: ProfileColorKey;
  avatarKey: ProfileAvatarKey;
  themeKey: ProfileThemeKey;
  symbolKey: ProfileSymbolKey;
}): Promise<PlayerProfile> {
  const { data, error } = await requireSupabase().rpc('update_profile', {
    p_display_name: input.displayName,
    p_color_key: input.colorKey,
    p_avatar_key: input.avatarKey,
    p_theme_key: input.themeKey,
    p_symbol_key: input.symbolKey,
  });
  if (error) throw error;
  return one<PlayerProfile>(data);
}

export async function touchProfilePresence() {
  const { error } = await requireSupabase().rpc('touch_profile_presence');
  if (error) throw error;
}
