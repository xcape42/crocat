import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import { currentUser } from '@/src/features/multiplayer/auth';
import {
  advanceRound,
  leaveRoom,
  loadRoomById,
  loadSubmissions,
  setReady,
} from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRoom } from '@/src/features/multiplayer/realtime';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing } from '@/src/types/game';

export default function OnlineRevealScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const { roundId, roomId } = useLocalSearchParams<{ roundId: string; roomId: string }>();
  const {
    userId,
    displayName,
    room,
    players,
    setIdentity,
    setRoomState,
    setOnlineUserIds,
    reset,
  } = useOnlineGameStore();

  const [head, setHead] = useState<CrocatDrawing | null>(null);
  const [body, setBody] = useState<CrocatDrawing | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const advanceRef = useRef(false);

  const goHome = useCallback(() => {
    reset();
    router.replace('/');
  }, [reset, router]);

  const refresh = useCallback(async () => {
    if (!roomId) return;

    try {
      const state = await loadRoomById(roomId);
      setRoomState(state.room, state.players, state.round);

      const activeUserId = useOnlineGameStore.getState().userId;
      const me = activeUserId
        ? state.players.find((player) => player.user_id === activeUserId)
        : undefined;

      if (me && !useOnlineGameStore.getState().role) {
        setIdentity(me.user_id, me.role);
      }

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
        return;
      }

      if (state.room.status === 'waiting') {
        router.replace(`/online/room/${state.room.code}`);
      }
    } catch {
      goHome();
    }
  }, [goHome, roomId, router, setIdentity, setRoomState]);

  const tryAdvance = useCallback(async () => {
    if (!roomId || advanceRef.current) return;
    advanceRef.current = true;

    try {
      await advanceRound(roomId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not continue to the next round.');
    } finally {
      advanceRef.current = false;
    }
  }, [refresh, roomId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!roundId || !roomId) throw new Error('Round is missing.');

        const user = await currentUser();
        if (!user) throw new Error('Guest session missing.');

        if (!userId) setIdentity(user.id);

        const [submissions] = await Promise.all([
          loadSubmissions(roundId),
          refresh(),
        ]);
        if (cancelled) return;

        setHead(submissions.find((item) => item.role === 'HEAD')?.drawing ?? null);
        setBody(submissions.find((item) => item.role === 'BODY')?.drawing ?? null);

        const activeRoom = useOnlineGameStore.getState().room;
        const activePlayers = useOnlineGameStore.getState().players;
        const me = activePlayers.find((player) => player.user_id === user.id);
        if (!activeRoom || !me) return;

        channelRef.current = await subscribeToRoom(
          activeRoom.id,
          user.id,
          displayName || me.display_name,
          {
            onSync: setOnlineUserIds,
            onRoomChange: refresh,
            onPlayerChange: refresh,
            onRoundChange: refresh,
          },
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the reveal.');
      }
    })();

    return () => {
      cancelled = true;
      void removeChannel(channelRef.current);
    };
  }, []);

  useEffect(() => {
    if (!room?.next_round_at || room.status !== 'reveal') return;

    const updateCountdown = () => {
      const next = Math.max(0, Math.ceil((new Date(room.next_round_at!).getTime() - Date.now()) / 1000));
      setSecondsLeft(next);
      if (next === 0) void tryAdvance();
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [room?.next_round_at, room?.status, tryAdvance]);

  const me = useMemo(
    () => players.find((player) => player.user_id === userId),
    [players, userId],
  );
  const bothReady = players.length === 2 && players.every((player) => player.ready);

  useEffect(() => {
    if (room?.status === 'reveal' && bothReady) void tryAdvance();
  }, [bothReady, room?.status, tryAdvance]);

  const toggleReady = async () => {
    if (!room || !me || busy) return;
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

  const leave = async () => {
    if (!room || busy) return;
    try {
      setBusy(true);
      await leaveRoom(room.id);
    } catch {
      // If the host already closed the room, Home is still the correct destination.
    } finally {
      goHome();
    }
  };

  if (!head || !body || !room) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.copy}>{error || 'Combining both halves…'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>ROOM {room.code} · REVEAL</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>A beautiful accident.</Text>
        </View>
        <View style={styles.countdown}>
          <Text style={styles.countdownLabel}>{bothReady ? 'STARTING' : 'NEXT ROUND'}</Text>
          <Text style={styles.countdownValue}>{bothReady ? 'READY' : `0:${String(secondsLeft).padStart(2, '0')}`}</Text>
        </View>
      </View>

      <View style={styles.previewArea}>
        <DrawingPreview head={head} body={body} />
      </View>

      <View style={styles.readyRow}>
        {players.map((player) => (
          <Text key={player.user_id} style={[styles.readyState, player.ready && styles.readyStateActive]}>
            {player.display_name} {player.ready ? '✓' : '…'}
          </Text>
        ))}
      </View>

      <Text style={styles.copy}>
        Both ready starts immediately. Otherwise the next round starts automatically after 30 seconds while both players stay in the room.
      </Text>

      <View style={styles.actions}>
        <CrocatButton disabled={busy || !me} onPress={toggleReady}>
          {me?.ready ? 'NOT READY' : 'READY NEXT ROUND'}
        </CrocatButton>
        <CrocatButton variant="ghost" disabled={busy} onPress={leave}>HOME / LEAVE ROOM</CrocatButton>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 8 },
  screenCompact: { gap: 6 },
  header: { flexShrink: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.3, fontSize: 10 },
  title: { marginTop: 4, fontSize: 30, lineHeight: 33, fontWeight: '900', color: colors.ink, letterSpacing: -1.1 },
  titleCompact: { fontSize: 25, lineHeight: 28 },
  countdown: { alignItems: 'flex-end' },
  countdownLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  countdownValue: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  previewArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  readyRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexShrink: 0 },
  readyState: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, color: colors.muted, backgroundColor: colors.card, fontSize: 10, fontWeight: '900' },
  readyStateActive: { color: colors.ink, backgroundColor: colors.moss },
  copy: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'center', flexShrink: 0 },
  actions: { gap: 7, flexShrink: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700', fontSize: 11 },
});
