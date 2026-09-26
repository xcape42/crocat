import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { currentUser } from '@/src/features/multiplayer/auth';
import { loadRoom, setReady, startRound } from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRoom } from '@/src/features/multiplayer/realtime';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function OnlineRoomScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const {
    displayName,
    userId,
    role,
    room,
    players,
    round,
    onlineUserIds,
    setIdentity,
    setRoomState,
    setOnlineUserIds,
  } = useOnlineGameStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    if (!code) return;
    const state = await loadRoom(String(code));
    setRoomState(state.room, state.players, state.round);

    const activeUserId = useOnlineGameStore.getState().userId;
    const activeRole = useOnlineGameStore.getState().role;
    const me = activeUserId
      ? state.players.find((player) => player.user_id === activeUserId)
      : undefined;

    if (me && !activeRole) setIdentity(me.user_id, me.role);

    if (state.room.status === 'drawing' && state.round && me) {
      router.replace({
        pathname: '/online/draw',
        params: {
          roomId: state.room.id,
          roundId: state.round.id,
          role: me.role,
          seconds: state.room.round_seconds,
          endsAt: state.round.ends_at,
        },
      });
    }
  }, [code, router, setIdentity, setRoomState]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError('');
        const user = await currentUser();
        if (!user) throw new Error('Guest session missing. Rejoin the room.');
        if (!userId) setIdentity(user.id, role);

        await refresh();
        if (cancelled) return;

        const active = useOnlineGameStore.getState().room;
        if (!active) return;

        channelRef.current = await subscribeToRoom(
          active.id,
          user.id,
          displayName || String(user.user_metadata?.display_name ?? 'Guest'),
          {
            onSync: setOnlineUserIds,
            onRoomChange: refresh,
            onPlayerChange: refresh,
            onRoundChange: refresh,
          },
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load room.');
      }
    })();

    return () => {
      cancelled = true;
      void removeChannel(channelRef.current);
    };
  }, []);

  const me = useMemo(
    () => players.find((player) => player.user_id === userId),
    [players, userId],
  );
  const bothReady = players.length === 2 && players.every((player) => player.ready);
  const isHost = Boolean(room && userId === room.host_id);

  const toggleReady = async () => {
    if (!room || !me) return;
    try {
      setBusy(true);
      await setReady(room.id, !me.ready);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update ready state.');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!room) return;
    try {
      setBusy(true);
      await startRound(room.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start round.');
    } finally {
      setBusy(false);
    }
  };

  if (!room && !error) {
    return <Screen><ActivityIndicator style={{ marginTop: 80 }} color={colors.ink} /></Screen>;
  }

  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.replace('/online')}>← LEAVE</Text>
      <View style={styles.header}>
        <Text style={styles.kicker}>ROOM</Text>
        <Text style={styles.code}>{String(code).toUpperCase()}</Text>
        <Text style={styles.copy}>Share this code. As soon as both players are ready, the host can start.</Text>
      </View>

      <View style={styles.players}>
        {players.map((player) => {
          const online = onlineUserIds.includes(player.user_id);
          return (
            <View key={player.user_id} style={[styles.player, player.role === 'HEAD' ? styles.head : styles.body]}>
              <View>
                <Text style={styles.name}>{player.display_name}</Text>
                <Text style={styles.role}>{player.role}</Text>
              </View>
              <View style={styles.state}>
                <Text style={styles.online}>{online ? '● ONLINE' : '○ CONNECTING'}</Text>
                <Text style={styles.ready}>{player.ready ? 'READY ✓' : 'NOT READY'}</Text>
              </View>
            </View>
          );
        })}
        {players.length < 2 && <View style={styles.waiting}><Text style={styles.waitingText}>Waiting for the second player…</Text></View>}
      </View>

      <View style={styles.bottom}>
        <CrocatButton disabled={busy || !me} onPress={toggleReady}>
          {me?.ready ? 'NOT READY' : 'I’M READY'}
        </CrocatButton>
        {isHost && (
          <CrocatButton variant="coral" disabled={busy || !bothReady || Boolean(round)} onPress={start}>
            START ROUND
          </CrocatButton>
        )}
        {!isHost && <Text style={styles.hostNote}>The host starts once everyone is ready.</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  header: { marginTop: spacing.xl, marginBottom: spacing.xl },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.5, fontSize: 11 },
  code: { marginTop: 6, fontSize: 54, fontWeight: '900', letterSpacing: 5, color: colors.ink },
  copy: { marginTop: 8, color: colors.muted, lineHeight: 21 },
  players: { gap: 12 },
  player: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink },
  head: { backgroundColor: colors.moss },
  body: { backgroundColor: colors.blue },
  name: { fontWeight: '900', fontSize: 18, color: colors.ink },
  role: { marginTop: 4, color: colors.ink, opacity: 0.6, fontWeight: '900', letterSpacing: 1.2, fontSize: 11 },
  state: { alignItems: 'flex-end', justifyContent: 'center' },
  online: { fontSize: 10, fontWeight: '900', color: colors.ink, opacity: 0.65 },
  ready: { marginTop: 5, fontSize: 11, fontWeight: '900', color: colors.ink },
  waiting: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, padding: 18, borderRadius: radius.md },
  waitingText: { color: colors.muted, textAlign: 'center', fontWeight: '700' },
  bottom: { marginTop: 'auto', gap: 10, paddingTop: 18 },
  hostNote: { textAlign: 'center', color: colors.muted, fontSize: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700' },
});
