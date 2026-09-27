import type { RealtimeChannel } from '@supabase/supabase-js';
import { requireSupabase } from '@/src/lib/supabase';
import type {
  FriendRequestSummary,
  FriendSummary,
  LobbyInviteSummary,
  SocialRoomTicket,
} from './types';

export async function listFriends(): Promise<FriendSummary[]> {
  const { data, error } = await requireSupabase().rpc('list_friends');
  if (error) throw error;
  return (data ?? []) as FriendSummary[];
}

export async function listFriendRequests(): Promise<FriendRequestSummary[]> {
  const { data, error } = await requireSupabase().rpc('list_friend_requests');
  if (error) throw error;
  return (data ?? []) as FriendRequestSummary[];
}

export async function sendFriendRequest(friendCode: string) {
  const { error } = await requireSupabase().rpc('send_friend_request', {
    p_friend_code: friendCode.trim().toUpperCase(),
  });
  if (error) throw error;
}

export async function respondFriendRequest(
  friendshipId: string,
  accept: boolean,
) {
  const { error } = await requireSupabase().rpc('respond_friend_request', {
    p_friendship_id: friendshipId,
    p_accept: accept,
  });
  if (error) throw error;
}

export async function removeFriend(friendUserId: string) {
  const { error } = await requireSupabase().rpc('remove_friend', {
    p_friend_user_id: friendUserId,
  });
  if (error) throw error;
}

export async function listLobbyInvites(): Promise<LobbyInviteSummary[]> {
  const { data, error } = await requireSupabase().rpc('list_lobby_invites');
  if (error) throw error;
  return (data ?? []) as LobbyInviteSummary[];
}

export async function inviteFriend(
  friendUserId: string,
  roomId?: string | null,
): Promise<SocialRoomTicket & { inviteId: string }> {
  const { data, error } = await requireSupabase().rpc('invite_friend', {
    p_friend_user_id: friendUserId,
    p_room_id: roomId ?? null,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Invite could not be created.');

  return {
    inviteId: row.invite_id,
    roomId: row.room_id,
    code: row.room_code,
  };
}

export async function acceptLobbyInvite(
  inviteId: string,
): Promise<SocialRoomTicket> {
  const { data, error } = await requireSupabase().rpc('accept_lobby_invite', {
    p_invite_id: inviteId,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Invite could not be accepted.');

  return {
    roomId: row.room_id,
    code: row.room_code,
    role: row.player_role,
  };
}

export async function declineLobbyInvite(inviteId: string) {
  const { error } = await requireSupabase().rpc('decline_lobby_invite', {
    p_invite_id: inviteId,
  });
  if (error) throw error;
}

export function subscribeToSocial(onChange: () => void): RealtimeChannel {
  return requireSupabase()
    .channel('social-' + Date.now())
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friendships' },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lobby_invites' },
      onChange,
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange();
    });
}

export async function removeSocialChannel(channel: RealtimeChannel | null) {
  if (!channel) return;
  await requireSupabase().removeChannel(channel);
}
