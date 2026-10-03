export type ProfileColorKey =
  | 'moss'
  | 'lime'
  | 'coral'
  | 'blue'
  | 'violet'
  | 'peach'
  | 'mint'
  | 'halo'
  | 'ember'
  | 'shadow';

export type MascotShapeKey = 'round' | 'ears' | 'spiky';
export type ProfileAvatarKey = MascotShapeKey;
export type MascotCharacterKey = 'gentle' | 'dreamy' | 'playful' | 'sunny' | 'cool';
export type CrocatWorldKey = 'moss' | 'moon' | 'candy' | 'halo' | 'ember' | 'shadow';
export type ProfileThemeKey = CrocatWorldKey | 'paper' | 'ink';
export type ProfileSymbolKey = 'star' | 'spark' | 'heart' | 'moon' | 'bolt';

export type PlayerProfile = {
  user_id: string;
  friend_code: string;
  display_name: string;
  color_key: ProfileColorKey;
  avatar_key: MascotShapeKey;
  mascot_character_key: MascotCharacterKey;
  theme_key: ProfileThemeKey;
  symbol_key: ProfileSymbolKey;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type ProfileVisual = {
  displayName: string;
  colorKey: ProfileColorKey;
  avatarKey: MascotShapeKey;
  mascotCharacterKey: MascotCharacterKey;
  themeKey: ProfileThemeKey;
  symbolKey: ProfileSymbolKey;
};

export type ProfileSnapshot = {
  userId?: string | null;
  displayName: string;
  colorKey: ProfileColorKey;
  avatarKey: MascotShapeKey;
  mascotCharacterKey?: MascotCharacterKey;
  themeKey: ProfileThemeKey;
  symbolKey: ProfileSymbolKey;
};

export function profileToVisual(profile: PlayerProfile): ProfileVisual {
  return {
    displayName: profile.display_name,
    colorKey: profile.color_key,
    avatarKey: profile.avatar_key,
    mascotCharacterKey: profile.mascot_character_key,
    themeKey: profile.theme_key,
    symbolKey: profile.symbol_key,
  };
}
