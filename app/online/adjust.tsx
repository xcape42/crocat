import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import {
  advancePhase,
  loadRoomById,
  loadSubmissions,
  saveTransform,
} from '@/src/features/multiplayer/room';
import {
  broadcastTransform,
  removeChannel,
  subscribeToAdjustment,
} from '@/src/features/multiplayer/realtime';
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
  const { round, setRoomState, reset } = useOnlineGameStore();

  const [head, setHead] = useState<CrocatDrawing | null>(null);
  const [body, setBody] = useState<CrocatDrawing | null>(null);
  const [headTransform, setHeadTransform] = useState<PartTransform>(ZERO);
  const [bodyTransform, setBodyTransform] = useState<PartTransform>(ZERO);
  const [secondsLeft, setSecondsLeft] = useState(15);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

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

      if (state.room.status === 'final_reveal' || state.room.status === 'reveal') {
        try {
          await saveTransform(params.roundId, role, ownTransformRef.current);
        } catch {
          // The server allows a small grace window; a peer may already have advanced the phase.
        }

        router.replace({
          pathname: '/online/reveal',
          params: { roomId: params.roomId, roundId: params.roundId },
        });
        return;
      }

      if (state.room.status === 'drawing' && state.round && state.round.id !== params.roundId) {
        router.replace({
          pathname: '/online/draw',
          params: {
            roomId: state.room.id,
            roundId: state.round.id,
            role,
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
      reset();
      router.replace('/');
    }
  }, [params.roomId, params.roundId, reset, role, router, setRoomState]);

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

  useEffect(() => {
    if (!round?.adjustment_ends_at || round.id !== params.roundId) return;

    const update = () => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(round.adjustment_ends_at!).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(seconds);
      if (seconds === 0) void finishAdjustment();
    };

    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [finishAdjustment, params.roundId, round?.adjustment_ends_at, round?.id]);

  const ownTransform = useMemo(
    () => role === 'HEAD' ? headTransform : bodyTransform,
    [bodyTransform, headTransform, role],
  );

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
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>LIVE ADJUSTMENT · YOUR {role}</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>Make it connect.</Text>
        </View>
        <View style={styles.countdown}>
          <Text style={styles.countdownLabel}>ADJUST</Text>
          <Text style={styles.countdownValue}>0:{String(secondsLeft).padStart(2, '0')}</Text>
        </View>
      </View>

      <Text style={styles.copy}>
        Drag only your {role.toLowerCase()}. Both players are adjusting at the same time.
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

      <View style={styles.zoomGroup}>
        <Text style={styles.zoomTitle}>{role} · ZOOM</Text>
        <Pressable accessibilityRole="button" onPress={() => zoom(-0.05)} style={styles.zoomButton}>
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
        <Text style={styles.scaleText}>{Math.round(ownTransform.scale * 100)}%</Text>
        <Pressable accessibilityRole="button" onPress={() => zoom(0.05)} style={styles.zoomButton}>
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
      </View>

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
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.2, fontSize: 10 },
  title: { marginTop: 4, fontSize: 30, lineHeight: 33, fontWeight: '900', color: colors.ink, letterSpacing: -1.1 },
  titleCompact: { fontSize: 25, lineHeight: 28 },
  countdown: { alignItems: 'flex-end' },
  countdownLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  countdownValue: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  copy: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'center', flexShrink: 0 },
  previewArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  zoomGroup: {
    alignSelf: 'center',
    flexShrink: 0,
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700', fontSize: 11 },
});
