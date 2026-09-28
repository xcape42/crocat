export type ProfileColorKey =
  | 'moss'
  | 'lime'
  | 'coral'
  | 'blue'
  | 'violet'
  | 'peach'
  | 'mint';

export type ProfileAvatarKey = 'round' | 'ears' | 'spiky';
export type CrocatWorldKey = 'moss' | 'moon' | 'candy';
export type ProfileThemeKey = CrocatWorldKey | 'paper' | 'ink';
export type ProfileSymbolKey = 'star' | 'spark' | 'heart' | 'moon' | 'bolt';

export type PlayerProfile = {
  user_id: string;
  friend_code: string;
  display_name: string;
  color_key: ProfileColorKey;
  avatar_key: ProfileAvatarKey;
  theme_key: ProfileThemeKey;
  symbol_key: ProfileSymbolKey;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type ProfileVisual = {
  displayName: string;
  colorKey: ProfileColorKey;
  avatarKey: ProfileAvatarKey;
  themeKey: ProfileThemeKey;
  symbolKey: ProfileSymbolKey;
};

export type ProfileSnapshot = {
  userId?: string | null;
  displayName: string;
  colorKey: ProfileColorKey;
  avatarKey: ProfileAvatarKey;
  themeKey: ProfileThemeKey;
  symbolKey: ProfileSymbolKey;
};

export function profileToVisual(profile: PlayerProfile): ProfileVisual {
  return {
    displayName: profile.display_name,
    colorKey: profile.color_key,
    avatarKey: profile.avatar_key,
    themeKey: profile.theme_key,
    symbolKey: profile.symbol_key,
  };
}
