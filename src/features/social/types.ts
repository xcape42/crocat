import type {
  ProfileAvatarKey,
  ProfileColorKey,
  ProfileSymbolKey,
  ProfileThemeKey,
  ProfileVisual,
} from '@/src/features/profile/types';

export type FriendSummary = {
  friend_user_id: string;
  display_name: string;
  friend_code: string;
  color_key: ProfileColorKey;
  avatar_key: ProfileAvatarKey;
  theme_key: ProfileThemeKey;
  symbol_key: ProfileSymbolKey;
  last_seen_at: string;
  online: boolean;
  open_room_code: string | null;
  friend_level: number;
  shared_rounds: number;
  friendship_label: string;
};

export type FriendRequestSummary = {
  friendship_id: string;
  other_user_id: string;
  direction: 'incoming' | 'outgoing';
  display_name: string;
  friend_code: string;
  color_key: ProfileColorKey;
  avatar_key: ProfileAvatarKey;
  theme_key: ProfileThemeKey;
  symbol_key: ProfileSymbolKey;
  created_at: string;
};

export type LobbyInviteSummary = {
  invite_id: string;
  sender_user_id: string;
  room_id: string;
  room_code: string;
  display_name: string;
  color_key: ProfileColorKey;
  avatar_key: ProfileAvatarKey;
  theme_key: ProfileThemeKey;
  symbol_key: ProfileSymbolKey;
  created_at: string;
  expires_at: string;
};

export type SocialRoomTicket = {
  roomId: string;
  code: string;
  role?: 'HEAD' | 'BODY';
};

export function socialProfileVisual(item: {
  display_name: string;
  color_key: ProfileColorKey;
  avatar_key: ProfileAvatarKey;
  theme_key: ProfileThemeKey;
  symbol_key: ProfileSymbolKey;
}): ProfileVisual {
  return {
    displayName: item.display_name,
    colorKey: item.color_key,
    avatarKey: item.avatar_key,
    themeKey: item.theme_key,
    symbolKey: item.symbol_key,
  };
}
