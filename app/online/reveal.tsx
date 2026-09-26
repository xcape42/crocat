import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import { currentUser } from '@/src/features/multiplayer/auth';
import {
  advancePhase,
  leaveRoom,
  loadRoomById,
  loadSubmissions,
  setReady,
} from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRoom } from '@/src/features/multiplayer/realtime';
import { useDeadlineCountdown } from '@/src/hooks/useDeadlineCountdown';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors } from '@/src/theme/tokens';
import type { CrocatDrawing, PartTransform } from '@/src/types/game';

const ZERO: PartTransform = { x: 0, y: 0, scale: 1 };

export default function OnlineRevealScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const { roundId, roomId } = useLocalSearchParams<{ roundId: string; roomId: string }>();
  const {
    userId,
    role,
    displayName,
    room,
    round,
    players,
    setIdentity,
    setRoomState,
    setOnlineUserIds,
    reset,
  } = useOnlineGameStore();

  const [head, setHead] = useState<CrocatDrawing | null>(null);
  const [body, setBody] = useState<CrocatDrawing | null>(null);
  const [headTransform, setHeadTransform] = useState<PartTransform>(ZERO);
  const [bodyTransform, setBodyTransform] = useState<PartTransform>(ZERO);
  const [error, setError] = useState('');
  const [readyBusy, setReadyBusy] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const advanceRef = useRef(false);

  const goHome = useCallback(() => {
    reset();
    router.replace('/');
  }, [reset, router]);

  const refresh = useCallback(async () => {
    if (!roomId || !roundId) return;

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

      if (state.room.status === 'prompt_select' && state.round && me) {
        router.replace({
          pathname: '/online/prompt',
          params: { roomId: state.room.id, roundId: state.round.id },
        });
        return;
      }

      if (state.room.status === 'adjusting' && me) {
        router.replace({
          pathname: '/online/adjust',
          params: { roomId, roundId, role: me.role },
        });
        return;
      }

      if (state.room.status === 'drawing' && state.round && state.round.id !== roundId && me) {
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
  }, [goHome, roomId, roundId, router, setIdentity, setRoomState]);

  const loadArtwork = useCallback(async () => {
    if (!roundId) return;
    const submissions = await loadSubmissions(roundId);
    const headSubmission = submissions.find((item) => item.role === 'HEAD');
    const bodySubmission = submissions.find((item) => item.role === 'BODY');

    setHead(headSubmission?.drawing ?? null);
    setBody(bodySubmission?.drawing ?? null);
    setHeadTransform(headSubmission?.transform ?? ZERO);
    setBodyTransform(bodySubmission?.transform ?? ZERO);
  }, [roundId]);

  const tryAdvance = useCallback(async () => {
    if (!roomId || advanceRef.current) return;
    advanceRef.current = true;

    try {
      await advancePhase(roomId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the next round.');
    } finally {
      advanceRef.current = false;
    }
  }, [refresh, roomId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!roomId || !roundId) throw new Error('Final reveal is missing.');

        const user = await currentUser();
        if (!user) throw new Error('Guest session missing.');
        if (!userId) setIdentity(user.id, role);

        await Promise.all([loadArtwork(), refresh()]);
        if (cancelled) return;

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
            onRoomChange: () => void refresh(),
            onPlayerChange: () => void refresh(),
            onRoundChange: () => {
              void loadArtwork();
              void refresh();
            },
          },
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load final reveal.');
      }
    })();

    return () => {
      cancelled = true;
      void removeChannel(channelRef.current);
    };
  }, []);

  const revealDeadline =
    round?.id === roundId ? round.final_reveal_ends_at : null;
  const secondsLeft = useDeadlineCountdown(revealDeadline, tryAdvance);

  const me = useMemo(
    () => players.find((player) => player.user_id === userId),
    [players, userId],
  );
  const readyCount = players.filter((player) => player.ready).length;
  const bothReady = players.length === 2 && readyCount === 2;

  useEffect(() => {
    if (
      room?.status === 'final_reveal'
      && bothReady
      && !advanceRef.current
    ) {
      void tryAdvance();
    }
  }, [bothReady, room?.status, tryAdvance]);

  const toggleReady = async () => {
    if (!room || !me || readyBusy) return;

    try {
      setReadyBusy(true);
      setError('');
      await setReady(room.id, !me.ready);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update next-round ready state.');
    } finally {
      setReadyBusy(false);
    }
  };

  const leave = async () => {
    if (!room) return;
    try {
      await leaveRoom(room.id);
    } catch {
      // Home remains the correct destination if the room already vanished.
    } finally {
      goHome();
    }
  };

  if (!head || !body || !room) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.copy}>{error || 'Preparing final reveal…'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>ROOM {room.code} · FINAL REVEAL</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>This is your Crocat.</Text>
        </View>
        <View style={styles.countdown}>
          <Text style={styles.countdownLabel}>NEXT ROUND</Text>
          <Text style={styles.countdownValue}>0:{String(secondsLeft).padStart(2, '0')}</Text>
        </View>
      </View>

      {!!round?.prompt_term && (
        <View style={styles.promptReveal}>
          <Text style={styles.promptTheme}>{round.prompt_theme?.toUpperCase()}</Text>
          <Text style={styles.promptTerm}>{round.prompt_term}</Text>
        </View>
      )}

      <View style={styles.previewArea}>
        <DrawingPreview
          head={head}
          body={body}
          headTransform={headTransform}
          bodyTransform={bodyTransform}
        />
      </View>

      <Text style={styles.copy}>
        Final result is locked. If both players are ready, the next round starts immediately; otherwise it starts when the 15-second timer ends.
      </Text>

      <View style={styles.readyRow}>
        <Text style={styles.readyStatus}>{readyCount}/2 READY</Text>
        <CrocatButton
          variant={me?.ready ? 'secondary' : 'coral'}
          disabled={readyBusy || !me}
          onPress={toggleReady}
        >
          {me?.ready ? 'NOT READY' : 'READY NEXT ROUND'}
        </CrocatButton>
      </View>

      <CrocatButton variant="ghost" onPress={leave}>HOME / LEAVE ROOM</CrocatButton>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 8 },
  screenCompact: { gap: 6 },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.3, fontSize: 10 },
  title: { marginTop: 4, fontSize: 30, lineHeight: 33, fontWeight: '900', color: colors.ink, letterSpacing: -1.1 },
  titleCompact: { fontSize: 25, lineHeight: 28 },
  countdown: { alignItems: 'flex-end' },
  countdownLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  countdownValue: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  promptReveal: { flexShrink: 0, alignItems: 'center' },
  promptTheme: { color: colors.coral, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  promptTerm: { marginTop: 2, color: colors.ink, fontSize: 18, fontWeight: '900' },
  previewArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  copy: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'center', flexShrink: 0 },
  readyRow: { flexShrink: 0, gap: 6 },
  readyStatus: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700', fontSize: 11 },
});
