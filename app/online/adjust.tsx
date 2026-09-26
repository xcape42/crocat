import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CountdownBadge } from '@/src/components/CountdownBadge';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { GameLeaveButton } from '@/src/components/GameLeaveButton';
import { Screen } from '@/src/components/Screen';
import {
  advancePhase,
  leaveRoom,
  loadRoomById,
  loadSubmissions,
  saveTransform,
  setReady,
} from '@/src/features/multiplayer/room';
import {
  broadcastTransform,
  removeChannel,
  subscribeToAdjustment,
} from '@/src/features/multiplayer/realtime';
import { clearActiveRoomCode } from '@/src/features/multiplayer/recentRoom';
import { useDeadlineCountdown } from '@/src/hooks/useDeadlineCountdown';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing, GameRole, PartTransform } from '@/src/types/game';

const ZERO: PartTransform = { x: 0, y: 0, scale: 1 };

function clampTransform(transform: PartTransform): PartTransform {
  return {
    x: Math.max(-360, Math.min(360, transform.x)),
    y: Math.max(-760, Math.min(760, transform.y)),
    scale: Math.max(0.75, Math.min(1.3, transform.scale)),
  };
}

export default function OnlineAdjustScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const params = useLocalSearchParams<{
    roomId: string;
    roundId: string;
    role: GameRole;
  }>();

  const role: GameRole = params.role === 'BODY' ? 'BODY' : 'HEAD';
  const {
    userId,
    room,
    players,
    round,
    setRoomState,
    reset,
  } = useOnlineGameStore();

  const [head, setHead] = useState<CrocatDrawing | null>(null);
  const [body, setBody] = useState<CrocatDrawing | null>(null);
  const [headTransform, setHeadTransform] = useState<PartTransform>(ZERO);
  const [bodyTransform, setBodyTransform] = useState<PartTransform>(ZERO);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [readyBusy, setReadyBusy] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const ownTransformRef = useRef<PartTransform>(ZERO);
  const lastBroadcastRef = useRef(0);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceRef = useRef(false);

  const setTransformForRole = useCallback((targetRole: GameRole, transform: PartTransform) => {
    const safe = clampTransform(transform);
    if (targetRole === 'HEAD') setHeadTransform(safe);
    else setBodyTransform(safe);
  }, []);

  const refresh = useCallback(async () => {
    if (!params.roomId || !params.roundId) return;

    try {
      const state = await loadRoomById(params.roomId);
      setRoomState(state.room, state.players, state.round);

      if (state.room.status === 'prompt_select' && state.round) {
        router.replace({
          pathname: '/online/prompt',
          params: { roomId: state.room.id, roundId: state.round.id },
        });
        return;
      }

      if (state.room.status === 'final_reveal' || state.room.status === 'reveal') {
        try {
          await saveTransform(params.roundId, role, ownTransformRef.current);
        } catch {
          // A peer may already have completed the adjustment phase.
        }

        router.replace({
          pathname: '/online/reveal',
          params: { roomId: params.roomId, roundId: params.roundId },
        });
        return;
      }

      if (state.room.status === 'drawing' && state.round && state.round.id !== params.roundId) {
        const currentUserId = useOnlineGameStore.getState().userId;
        const me = state.players.find((player) => player.user_id === currentUserId);
        router.replace({
          pathname: '/online/draw',
          params: {
            roomId: state.room.id,
            roundId: state.round.id,
            role: me?.role ?? role,
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
      setError('Connection interrupted. Reconnecting…');
    }
  }, [params.roomId, params.roundId, role, router, setRoomState]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!params.roomId || !params.roundId) throw new Error('Adjustment phase is missing.');

        const [submissions] = await Promise.all([
          loadSubmissions(params.roundId),
          refresh(),
        ]);
        if (cancelled) return;

        const headSubmission = submissions.find((item) => item.role === 'HEAD');
        const bodySubmission = submissions.find((item) => item.role === 'BODY');

        setHead(headSubmission?.drawing ?? null);
        setBody(bodySubmission?.drawing ?? null);
        setHeadTransform(headSubmission?.transform ?? ZERO);
        setBodyTransform(bodySubmission?.transform ?? ZERO);

        const initialOwn = role === 'HEAD'
          ? (headSubmission?.transform ?? ZERO)
          : (bodySubmission?.transform ?? ZERO);
        ownTransformRef.current = initialOwn;

        channelRef.current = await subscribeToAdjustment(
          params.roundId,
          params.roomId,
          (remoteRole, transform) => {
            if (remoteRole === role) return;
            setTransformForRole(remoteRole, transform);
          },
          refresh,
        );

        if (!cancelled) setLoaded(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not start adjustment.');
      }
    })();

    return () => {
      cancelled = true;
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      void removeChannel(channelRef.current);
    };
  }, []);

  const persistOwn = useCallback((transform: PartTransform) => {
    if (!params.roundId) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);

    persistTimerRef.current = setTimeout(() => {
      void saveTransform(params.roundId, role, transform).catch(() => {
        // Final save at the phase boundary remains authoritative.
      });
    }, 300);
  }, [params.roundId, role]);

  const broadcastOwn = useCallback((transform: PartTransform) => {
    const channel = channelRef.current;
    if (!channel) return;

    const send = () => {
      lastBroadcastRef.current = Date.now();
      void broadcastTransform(channel, role, transform);
    };

    const elapsed = Date.now() - lastBroadcastRef.current;
    if (elapsed >= 80) {
      if (broadcastTimerRef.current) {
        clearTimeout(broadcastTimerRef.current);
        broadcastTimerRef.current = null;
      }
      send();
      return;
    }

    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(send, 80 - elapsed);
  }, [role]);

  const updateOwn = useCallback((transform: PartTransform) => {
    const safe = clampTransform(transform);
    ownTransformRef.current = safe;
    setTransformForRole(role, safe);
    broadcastOwn(safe);
    persistOwn(safe);
  }, [broadcastOwn, persistOwn, role, setTransformForRole]);

  const moveOwn = useCallback((targetRole: GameRole, dx: number, dy: number) => {
    if (targetRole !== role) return;
    const current = ownTransformRef.current;
    updateOwn({
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    });
  }, [role, updateOwn]);

  const zoom = (delta: number) => {
    const current = ownTransformRef.current;
    updateOwn({
      ...current,
      scale: current.scale + delta,
    });
  };

  const finishAdjustment = useCallback(async () => {
    if (!params.roomId || !params.roundId || advanceRef.current) return;
    advanceRef.current = true;

    try {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      await saveTransform(params.roundId, role, ownTransformRef.current);
      await advancePhase(params.roomId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish adjustment.');
      await refresh();
    } finally {
      advanceRef.current = false;
    }
  }, [params.roomId, params.roundId, refresh, role]);

  const adjustmentDeadline =
    round?.id === params.roundId ? round.adjustment_ends_at : null;
  const secondsLeft = useDeadlineCountdown(adjustmentDeadline, finishAdjustment);

  const me = useMemo(
    () => players.find((player) => player.user_id === userId),
    [players, userId],
  );
  const readyCount = players.filter((player) => player.ready).length;
  const bothReady = players.length === 2 && readyCount === 2;

  useEffect(() => {
    if (room?.status === 'adjusting' && bothReady && !advanceRef.current) {
      void finishAdjustment();
    }
  }, [bothReady, finishAdjustment, room?.status]);

  const toggleReady = async () => {
    if (!room || !me || readyBusy) return;

    try {
      setReadyBusy(true);
      setError('');
      if (!me.ready && params.roundId) {
        await saveTransform(params.roundId, role, ownTransformRef.current);
      }
      await setReady(room.id, !me.ready);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update adjustment ready state.');
    } finally {
      setReadyBusy(false);
    }
  };

  const leave = async () => {
    if (!params.roomId || readyBusy) return;
    try {
      setReadyBusy(true);
      await leaveRoom(params.roomId);
    } catch {
      // Leaving remains valid if the room vanished first.
    } finally {
      await clearActiveRoomCode();
      reset();
      router.replace('/');
    }
  };

  const ownTransform = useMemo(
    () => role === 'HEAD' ? headTransform : bodyTransform,
    [bodyTransform, headTransform, role],
  );
  const partLabel = (
    role === 'HEAD'
      ? round?.prompt_head_label
      : round?.prompt_body_label
  ) ?? (role === 'HEAD' ? 'Upper Part' : 'Lower Part');

  if (!loaded || !head || !body) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.copy}>{error || 'Preparing both parts…'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]}>
      <GameLeaveButton disabled={readyBusy} onPress={leave} />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>LIVE ADJUSTMENT · YOUR {partLabel.toUpperCase()}</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>Make it connect.</Text>
        </View>
        <CountdownBadge remaining={secondsLeft} label="ADJUST" />
      </View>

      <Text style={styles.copy}>
        {round?.prompt_term ? `DRAW · ${round.prompt_term} · ` : ''}
        Drag only your {partLabel.toLowerCase()}. Ready does not lock your controls.
      </Text>

      <View style={styles.previewArea}>
        <DrawingPreview
          head={head}
          body={body}
          headTransform={headTransform}
          bodyTransform={bodyTransform}
          interactive
          interactiveRole={role}
          onMovePart={moveOwn}
        />
      </View>

      <View style={styles.controls}>
        <View style={styles.zoomGroup}>
          <Text style={styles.zoomTitle}>{partLabel.toUpperCase()} · ZOOM</Text>
          <Pressable accessibilityRole="button" onPress={() => zoom(-0.05)} style={styles.zoomButton}>
            <Text style={styles.zoomText}>−</Text>
          </Pressable>
          <Text style={styles.scaleText}>{Math.round(ownTransform.scale * 100)}%</Text>
          <Pressable accessibilityRole="button" onPress={() => zoom(0.05)} style={styles.zoomButton}>
            <Text style={styles.zoomText}>+</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={readyBusy || !me}
          onPress={toggleReady}
          style={[styles.readyButton, me?.ready && styles.readyButtonActive]}
        >
          <Text style={styles.readyButtonText}>
            {me?.ready ? 'READY ✓' : 'READY TO REVEAL'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.readyStatus}>
        {readyCount}/2 READY · both ready skips the remaining adjustment time
      </Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 7 },
  screenCompact: { gap: 5 },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerText: { flex: 1 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.2, fontSize: 10 },
  title: { marginTop: 3, fontSize: 30, lineHeight: 33, fontWeight: '900', color: colors.ink, letterSpacing: -1.1 },
  titleCompact: { fontSize: 25, lineHeight: 28 },
  copy: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'center', flexShrink: 0 },
  previewArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  controls: {
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  zoomGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  zoomTitle: { fontSize: 9, color: colors.muted, fontWeight: '900', letterSpacing: 1 },
  zoomButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: { fontSize: 18, fontWeight: '900', color: colors.ink },
  scaleText: { minWidth: 36, textAlign: 'center', fontSize: 10, fontWeight: '900', color: colors.ink },
  readyButton: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
  },
  readyButtonActive: { backgroundColor: colors.lime },
  readyButtonText: {
    color: colors.ink,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  readyStatus: {
    flexShrink: 0,
    color: colors.muted,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700', fontSize: 11 },
});
