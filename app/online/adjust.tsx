import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
import { CountdownBadge } from '@/src/components/CountdownBadge';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Mascot } from '@/src/components/Mascot';
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
import { useDeadlineCountdown } from '@/src/hooks/useDeadlineCountdown';
import { useReliablePhaseSync } from '@/src/hooks/useReliablePhaseSync';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { getPromptPartLabel } from '@/src/features/multiplayer/types';
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
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

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
          // The server allows a small grace window; a peer may already have advanced the phase.
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
      reset();
      router.replace('/');
    }
  }, [params.roomId, params.roundId, reset, role, router, setRoomState]);

  useReliablePhaseSync({
    roomId: params.roomId,
    roundId: params.roundId,
    screen: 'adjusting',
    fallbackRole: role,
  });

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

  const timerWaiting =
    round?.id === params.roundId
    && round.phase_timer_started_at === null;
  const adjustmentDeadline =
    round?.id === params.roundId && !timerWaiting
      ? round.adjustment_ends_at
      : null;
  const countdownSeconds = useDeadlineCountdown(
    adjustmentDeadline,
    finishAdjustment,
    { clock: 'server' },
  );
  const secondsLeft = timerWaiting ? 15 : countdownSeconds;

  const me = useMemo(
    () => players.find((player) => player.user_id === userId),
    [players, userId],
  );
  const readyCount = players.filter((player) => player.ready).length;

  const toggleReady = async () => {
    if (!params.roomId || !params.roundId || !me || readyBusy) return;

    try {
      setReadyBusy(true);
      setError('');
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      await saveTransform(params.roundId, role, ownTransformRef.current);
      await setReady(params.roomId, !me.ready);
      await advancePhase(params.roomId);
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
      // Returning home is still correct if the room disappeared first.
    } finally {
      reset();
      router.replace('/');
    }
  };

  const requestLeave = () => {
    if (!readyBusy) setLeaveConfirmOpen(true);
  };

  const leaveModal = (
    <ConfirmActionModal
      visible={leaveConfirmOpen}
      title="Leave the game?"
      message="The current round will end for the room."
      confirmLabel="YES, LEAVE"
      cancelLabel="NO"
      busy={readyBusy}
      onCancel={() => setLeaveConfirmOpen(false)}
      onConfirm={() => void leave()}
    />
  );

  const ownTransform = useMemo(
    () => role === 'HEAD' ? headTransform : bodyTransform,
    [bodyTransform, headTransform, role],
  );
  const partLabel = getPromptPartLabel(round, role);

  if (!loaded || !head || !body) {
    return (
      <Screen scroll={false} backLabel="LEAVE" onBack={requestLeave}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.copy}>{error || 'Preparing both parts…'}</Text>
        </View>
        {leaveModal}
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]} backLabel="LEAVE" onBack={requestLeave} decorations="none">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>LIVE ADJUSTMENT · YOUR {partLabel.toUpperCase()}</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>Make it connect.</Text>
        </View>
        <View style={styles.headerActions}>
          <CountdownBadge remaining={secondsLeft} label="ADJUST" />
          {!!me?.profile && (
            <Mascot
              themeKey={me.profile.theme_key}
              state={secondsLeft <= 5 ? 'nervous' : (me.ready ? 'happy' : 'idle')}
              size={40}
            />
          )}
        </View>
      </View>

      <Text style={styles.copy}>
        {round?.prompt_term ? `DRAW · ${round.prompt_term} · ` : ''}
        Drag only your {partLabel.toLowerCase()}. Both players are adjusting at the same time.
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

        <View style={styles.readyGroup}>
          <Text style={styles.readyCount}>{readyCount}/{Math.max(1, players.length)} READY</Text>
          <Pressable
            accessibilityRole="button"
            disabled={readyBusy || !me}
            onPress={toggleReady}
            style={[styles.readyButton, me?.ready && styles.readyButtonActive]}
          >
            <Text style={styles.readyText}>{me?.ready ? 'NOT READY' : 'READY TO REVEAL'}</Text>
          </Pressable>
        </View>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {leaveModal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 8 },
  screenCompact: { gap: 6 },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerText: { flex: 1 },
  headerActions: { alignItems: 'center', gap: 5, flexShrink: 0 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.2, fontSize: 10 },
  title: { marginTop: 4, fontSize: 30, lineHeight: 33, fontWeight: '900', color: colors.ink, letterSpacing: -1.1 },
  titleCompact: { fontSize: 25, lineHeight: 28 },
  copy: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'center', flexShrink: 0 },
  previewArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  controls: { flexShrink: 0, gap: 7, alignItems: 'center' },
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
  readyGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readyCount: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  readyButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.card,
  },
  readyButtonActive: { backgroundColor: colors.lime },
  readyText: { color: colors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700', fontSize: 11 },
});
