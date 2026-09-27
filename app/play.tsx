import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { CrocatButton } from '@/src/components/CrocatButton';
import { FriendQuickBar } from '@/src/components/FriendQuickBar';
import { Screen } from '@/src/components/Screen';
import { ensureCurrentProfile } from '@/src/features/profile/api';
import {
  inviteFriend,
  joinFriendLobby,
  listFriends,
  removeSocialChannel,
  subscribeToSocial,
} from '@/src/features/social/api';
import type { FriendSummary } from '@/src/features/social/types';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function PlayScreen() {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [busyFriend, setBusyFriend] = useState('');
  const [error, setError] = useState('');
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refreshFriends = useCallback(async () => {
    try {
      setFriends(await listFriends());
    } catch {
      // Play still works without social data.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void ensureCurrentProfile()
      .then(async () => {
        if (cancelled) return;
        await refreshFriends();
        if (cancelled) return;
        channelRef.current = subscribeToSocial(() => void refreshFriends());
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      void removeSocialChannel(channelRef.current);
    };
  }, [refreshFriends]);

  const playWithFriend = async (friend: FriendSummary) => {
    if (!friend.online || busyFriend) return;

    try {
      setBusyFriend(friend.friend_user_id);
      setError('');

      const ticket = friend.open_room_code
        ? await joinFriendLobby(friend.friend_user_id)
        : await inviteFriend(friend.friend_user_id);

      router.replace('/online/room/' + ticket.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open friend lobby.');
      await refreshFriends();
    } finally {
      setBusyFriend('');
    }
  };

  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.back()}>← HOME</Text>

      <View style={styles.friends}>
        <FriendQuickBar
          friends={friends}
          busyUserId={busyFriend}
          title="PLAY WITH A FRIEND"
          emptyText="Add friends to start rooms with one tap."
          onPress={(friend) => void playWithFriend(friend)}
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>Choose your chaos.</Text>
        <Text style={styles.copy}>
          Online lets you create a room or enter a code. Friends above stay available for one-tap play.
        </Text>
      </View>

      <View style={styles.stack}>
        <View style={[styles.card, styles.onlineCard]}>
          <View style={[styles.badge, { backgroundColor: colors.coral }]}>
            <Text style={styles.badgeText}>PRIMARY · ONLINE</Text>
          </View>
          <Text style={styles.mode}>Split Online</Text>
          <Text style={styles.modeCopy}>
            Create a fresh room or enter a room code. Online friends above still open
            the fastest route into a game.
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>2 DEVICES</Text>
            <Text style={styles.meta}>REALTIME</Text>
            <Text style={styles.meta}>FRIENDS</Text>
          </View>
          <CrocatButton variant="coral" onPress={() => router.push('/online')}>
            PLAY ONLINE
          </CrocatButton>
        </View>

        <View style={[styles.card, styles.localCard]}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>LOCAL</Text>
          </View>
          <Text style={styles.modeSmall}>Split Local</Text>
          <Text style={styles.modeCopy}>
            Two people, one device. Draw one half, pass it over, reveal at the end.
          </Text>
          <CrocatButton variant="secondary" onPress={() => router.push('/lobby')}>
            PLAY LOCAL
          </CrocatButton>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  friends: { marginTop: 18 },
  hero: { marginTop: spacing.xl, marginBottom: spacing.lg },
  title: {
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.8,
    fontWeight: '900',
    color: colors.ink,
  },
  copy: { marginTop: 8, color: colors.muted, fontSize: 16, lineHeight: 22 },
  stack: { gap: 14, paddingBottom: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: spacing.lg,
    gap: 14,
  },
  onlineCard: { backgroundColor: '#FFF7F2' },
  localCard: { borderColor: colors.line },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.moss,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  mode: { fontSize: 40, fontWeight: '900', color: colors.ink, letterSpacing: -1.5 },
  modeSmall: { fontSize: 30, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  modeCopy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  meta: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
  },
  error: {
    marginTop: 8,
    color: '#A74343',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});
