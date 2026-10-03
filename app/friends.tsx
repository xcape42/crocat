import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CrocatCard } from '@/src/components/CrocatCard';
import { Mascot } from '@/src/components/Mascot';
import { Screen } from '@/src/components/Screen';
import { ensureCurrentProfile } from '@/src/features/profile/api';
import { profileToVisual, type PlayerProfile } from '@/src/features/profile/types';
import {
  acceptLobbyInvite,
  declineLobbyInvite,
  inviteFriend,
  joinFriendLobby,
  listFriendRequests,
  listFriends,
  listLobbyInvites,
  removeFriend,
  removeSocialChannel,
  respondFriendRequest,
  sendFriendRequest,
  subscribeToSocial,
} from '@/src/features/social/api';
import type {
  FriendRequestSummary,
  FriendSummary,
  LobbyInviteSummary,
} from '@/src/features/social/types';
import { socialProfileVisual } from '@/src/features/social/types';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';

function MiniButton({
  label,
  onPress,
  strong = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  strong?: boolean;
  disabled?: boolean;
}) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.miniButton,
        {
          borderColor: world.colors.text,
          backgroundColor: strong ? world.colors.primary : world.colors.surface,
        },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.miniButtonText, { color: world.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function lastSeenText(friend: FriendSummary) {
  if (friend.online) return '● ONLINE';

  const elapsed = Math.max(0, Date.now() - new Date(friend.last_seen_at).getTime());
  const minutes = Math.floor(elapsed / 60_000);

  if (minutes < 1) return '○ JUST NOW';
  if (minutes < 60) return '○ ' + minutes + 'M AGO';

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return '○ ' + hours + 'H AGO';

  return '○ ' + Math.floor(hours / 24) + 'D AGO';
}

export default function FriendsScreen() {
  const router = useRouter();
  const { inviteRoomId } = useLocalSearchParams<{
    inviteRoomId?: string;
  }>();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [requests, setRequests] = useState<FriendRequestSummary[]>([]);
  const [invites, setInvites] = useState<LobbyInviteSummary[]>([]);
  const [friendCode, setFriendCode] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);

  const refresh = useCallback(async () => {
    try {
      const [nextFriends, nextRequests, nextInvites] = await Promise.all([
        listFriends(),
        listFriendRequests(),
        listLobbyInvites(),
      ]);
      setFriends(nextFriends);
      setRequests(nextRequests);
      setInvites(nextInvites);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh friends.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const identity = await ensureCurrentProfile();
        if (cancelled) return;
        setProfile(identity.profile);
        await refresh();
        if (cancelled) return;
        channelRef.current = subscribeToSocial(() => void refresh());
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not open friends.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      void removeSocialChannel(channelRef.current);
    };
  }, [refresh]);

  const run = async (
    key: string,
    action: () => Promise<void>,
    message?: string,
  ) => {
    try {
      setBusyKey(key);
      setError('');
      await action();
      if (message) setNotice(message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusyKey('');
    }
  };

  const add = async () => {
    const normalized = friendCode.trim().toUpperCase();

    if (normalized.length !== 8) {
      setError('Enter the 8-character friend code.');
      return;
    }

    await run(
      'add',
      async () => {
        await sendFriendRequest(normalized);
        setFriendCode('');
      },
      'FRIEND REQUEST SENT ✓',
    );
  };

  const invite = async (friend: FriendSummary) => {
    await run('invite:' + friend.friend_user_id, async () => {
      if (inviteRoomId) {
        await inviteFriend(friend.friend_user_id, inviteRoomId);
        setNotice('INVITE SENT TO ' + friend.display_name.toUpperCase() + ' ✓');
        return;
      }

      const ticket = await inviteFriend(friend.friend_user_id, null);
      router.replace('/online/room/' + ticket.code);
    });
  };

  const copyCode = async () => {
    if (!profile) return;
    await Clipboard.setStringAsync(profile.friend_code);
    setNotice('FRIEND CODE COPIED ✓');
    setTimeout(() => setNotice(''), 1800);
  };

  const joinOpenLobby = async (friend: FriendSummary) => {
    await run('join:' + friend.friend_user_id, async () => {
      const ticket = await joinFriendLobby(friend.friend_user_id);
      router.replace('/online/room/' + ticket.code);
    });
  };

  const acceptInvite = async (item: LobbyInviteSummary) => {
    await run('lobby:' + item.invite_id, async () => {
      const ticket = await acceptLobbyInvite(item.invite_id);
      router.replace('/online/room/' + ticket.code);
    });
  };

  const onlineFriends = friends
    .filter((friend) => friend.online)
    .sort((left, right) => {
      const leftOpen = left.open_room_code ? 1 : 0;
      const rightOpen = right.open_room_code ? 1 : 0;
      if (leftOpen !== rightOpen) return rightOpen - leftOpen;
      return left.display_name.localeCompare(right.display_name);
    });

  const offlineFriends = friends
    .filter((friend) => !friend.online)
    .sort(
      (left, right) =>
        new Date(right.last_seen_at).getTime()
        - new Date(left.last_seen_at).getTime(),
    );

  const renderFriend = (friend: FriendSummary) => {
    const friendWorld = crocatWorld(friend.theme_key);

    return (
      <CrocatCard key={friend.friend_user_id} style={styles.friendCard}>
        <View style={styles.friendIdentity}>
          <Mascot
            profile={socialProfileVisual(friend)}
            state={friend.online ? 'idle' : 'sleeping'}
            size={52}
            animated={false}
          />
        </View>

        <View style={styles.friendMain}>
          <View style={styles.friendTop}>
            <Text style={[styles.name, { color: world.colors.text }]}>{friend.display_name}</Text>
            <Text
              style={[
                styles.presence,
                { color: friend.online ? '#79B975' : world.colors.muted },
              ]}
            >
              {lastSeenText(friend)}
            </Text>
          </View>

          <Text style={[styles.worldMeta, { color: friendWorld.colors.muted }]}>
            {friendWorld.label}
          </Text>
          <Text style={[styles.meta, { color: world.colors.muted }]}>
            LV {friend.friend_level} · {friend.friendship_label}
            {friend.open_room_code ? ' · OPEN ROOM ' + friend.open_room_code : ''}
          </Text>

          <View style={styles.friendActions}>
            {!!friend.open_room_code && !inviteRoomId && (
              <MiniButton
                strong
                label="JOIN"
                disabled={!!busyKey}
                onPress={() => void joinOpenLobby(friend)}
              />
            )}
            <MiniButton
              strong={!friend.open_room_code || !!inviteRoomId}
              label="INVITE"
              disabled={!!busyKey}
              onPress={() => void invite(friend)}
            />
            <MiniButton
              label="REMOVE"
              disabled={!!busyKey}
              onPress={() => void run(
                'remove:' + friend.friend_user_id,
                () => removeFriend(friend.friend_user_id),
              )}
            />
          </View>
        </View>
      </CrocatCard>
    );
  };

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: 80 }} color={world.colors.text} />
      </Screen>
    );
  }

  return (
    <Screen backLabel={inviteRoomId ? 'ROOM' : 'HOME'} decorations="full">

      <View style={styles.header}>
        <View>
          <Text style={[styles.kicker, { color: world.colors.accent }]}>{inviteRoomId ? 'INVITE TO ROOM' : 'YOUR PEOPLE'}</Text>
          <Text style={[styles.title, { color: world.colors.text }]}>Friends</Text>
        </View>

        {!!profile && (
          <Pressable onPress={() => router.push('/profile')}>
            <Mascot profile={profileToVisual(profile)} state="idle" size={58} />
          </Pressable>
        )}
      </View>

      {!!invites.length && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: world.colors.muted }]}>LOBBY INVITES</Text>
          {invites.map((item) => (
            <View key={item.invite_id} style={[
              styles.card,
              {
                borderColor: world.colors.line,
                backgroundColor: world.colors.card,
              },
            ]}>
              <Mascot profile={socialProfileVisual(item)} state="happy" size={50} animated={false} />
              <View style={styles.cardText}>
                <Text style={[styles.name, { color: world.colors.text }]}>{item.display_name}</Text>
                <Text style={[styles.meta, { color: world.colors.muted }]}>ROOM {item.room_code} · WANTS TO DRAW</Text>
              </View>
              <View style={styles.cardActions}>
                <MiniButton
                  strong
                  label="JOIN"
                  disabled={!!busyKey}
                  onPress={() => void acceptInvite(item)}
                />
                <MiniButton
                  label="NO"
                  disabled={!!busyKey}
                  onPress={() => void run(
                    'decline:' + item.invite_id,
                    () => declineLobbyInvite(item.invite_id),
                  )}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.addCard}>
        <View style={styles.addTop}>
          <View>
            <Text style={[styles.sectionTitle, { color: world.colors.muted }]}>ADD FRIEND</Text>
          </View>
          <Pressable onPress={() => router.push('/profile')}>
            <Text style={[styles.editProfile, { color: world.colors.accent }]}>EDIT PROFILE →</Text>
          </Pressable>
        </View>

        <View style={styles.addRow}>
          <TextInput
            value={friendCode}
            onChangeText={(value) => setFriendCode(
              value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
            )}
            placeholder="FRIEND CODE"
            placeholderTextColor={world.colors.muted}
            maxLength={8}
            autoCapitalize="characters"
            style={[
              styles.codeInput,
              {
                borderColor: world.colors.text,
                color: world.colors.text,
                backgroundColor: world.colors.card,
              },
            ]}
          />
          <MiniButton
            strong
            label={busyKey === 'add' ? '…' : 'ADD'}
            disabled={!!busyKey}
            onPress={() => void add()}
          />
        </View>
        <Pressable onPress={copyCode}>
          {!!profile && <Text style={[styles.yourCode, { color: world.colors.text }]}>YOURS · {profile.friend_code}</Text>}
        </Pressable>
      </View>

      {!!notice && <Text style={[styles.notice, { color: world.colors.text }]}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}

      {!!requests.length && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: world.colors.muted }]}>REQUESTS</Text>
          {requests.map((item) => (
            <View key={item.friendship_id} style={[
              styles.card,
              {
                borderColor: world.colors.line,
                backgroundColor: world.colors.card,
              },
            ]}>
              <Mascot profile={socialProfileVisual(item)} state="curious" size={48} animated={false} />
              <View style={styles.cardText}>
                <Text style={[styles.name, { color: world.colors.text }]}>{item.display_name}</Text>
                <Text style={[styles.meta, { color: world.colors.muted }]}>
                  {item.direction === 'incoming' ? 'WANTS TO BE FRIENDS' : 'REQUEST SENT'}
                </Text>
              </View>

              {item.direction === 'incoming' ? (
                <View style={styles.cardActions}>
                  <MiniButton
                    strong
                    label="YES"
                    disabled={!!busyKey}
                    onPress={() => void run(
                      'request:' + item.friendship_id,
                      () => respondFriendRequest(item.friendship_id, true),
                    )}
                  />
                  <MiniButton
                    label="NO"
                    disabled={!!busyKey}
                    onPress={() => void run(
                      'request:' + item.friendship_id,
                      () => respondFriendRequest(item.friendship_id, false),
                    )}
                  />
                </View>
              ) : (
                <MiniButton
                  label="CANCEL"
                  disabled={!!busyKey}
                  onPress={() => void run(
                    'remove:' + item.other_user_id,
                    () => removeFriend(item.other_user_id),
                  )}
                />
              )}
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: world.colors.muted }]}>FRIENDS · {friends.length}</Text>

        {!friends.length ? (
          <View style={[styles.empty, { borderColor: world.colors.line }]}>
            <Text style={[styles.emptyFace, { color: world.colors.text }]}>◉ ᴗ ◉</Text>
            <Text style={[styles.emptyTitle, { color: world.colors.text }]}>A little quiet here.</Text>
            <Text style={[styles.emptyCopy, { color: world.colors.muted }]}>Share your friend code or add someone above.</Text>
          </View>
        ) : (
          <>
            <View style={styles.friendGroup}>
              <View style={styles.groupHeader}>
                <Text style={[styles.groupTitle, { color: world.colors.text }]}>ONLINE · {onlineFriends.length}</Text>
                <View style={styles.onlineDot} />
              </View>
              {onlineFriends.length
                ? onlineFriends.map(renderFriend)
                : <Text style={[styles.groupEmpty, { color: world.colors.muted }]}>No friends online right now.</Text>}
            </View>

            <View style={styles.friendGroup}>
              <View style={styles.groupHeader}>
                <Text style={[styles.groupTitle, { color: world.colors.text }]}>OFFLINE · {offlineFriends.length}</Text>
                <View style={styles.offlineDot} />
              </View>
              {offlineFriends.length
                ? offlineFriends.map(renderFriend)
                : <Text style={[styles.groupEmpty, { color: world.colors.muted }]}>Everyone is online.</Text>}
            </View>
          </>
        )}
      </View>


    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  header: {
    marginTop: spacing.xl,
    marginBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { marginTop: 3, fontSize: 46, fontWeight: '900', letterSpacing: -1.8, color: colors.ink },
  section: { marginTop: 18, gap: 9 },
  sectionTitle: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  addCard: {
    //padding: 14,
    //borderRadius: radius.md,
    //borderWidth: 1,
    //borderColor: colors.line,
    //backgroundColor: colors.card,
    gap: 10,
  },
  addTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  yourCode: { marginTop: 4, color: colors.ink, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  editProfile: { color: colors.coral, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  codeInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ink,
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2,
    backgroundColor: colors.card,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  friendGroup: { gap: 9, marginTop: 4 },
  groupHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 2,
  },
  groupTitle: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: '#4F7B4A',
  },
  offlineDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: colors.line,
  },
  groupEmpty: {
    paddingVertical: 12,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  cardText: { flex: 1, minWidth: 0 },
  friendIdentity: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  friendMain: { flex: 1, minWidth: 0 },
  friendTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  worldMeta: { fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 2 },
  meta: { marginTop: 3, color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.65 },
  presence: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  presenceOnline: { color: '#4F7B4A' },
  cardActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  friendActions: { marginTop: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  miniButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  miniButtonStrong: { backgroundColor: colors.lime },
  miniButtonText: { color: colors.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.65 },
  disabled: { opacity: 0.42 },
  pressed: { transform: [{ scale: 0.97 }] },
  empty: {
    padding: 28,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
  },
  emptyFace: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  emptyTitle: { marginTop: 8, color: colors.ink, fontSize: 19, fontWeight: '900' },
  emptyCopy: { marginTop: 4, color: colors.muted, fontSize: 12, textAlign: 'center' },
  notice: { marginTop: 14, textAlign: 'center', color: colors.ink, fontWeight: '900', fontSize: 11 },
  error: { marginTop: 14, textAlign: 'center', color: '#A74343', fontWeight: '700' },
});
