import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
import { CountdownBadge } from '@/src/components/CountdownBadge';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingCanvas } from '@/src/components/DrawingCanvas';
import { DrawingToolbar } from '@/src/components/DrawingToolbar';
import { Mascot } from '@/src/components/Mascot';
import { profileToVisual } from '@/src/features/profile/types';
import { Screen } from '@/src/components/Screen';
import {
  advanceDrawing,
  leaveRoom,
  loadRoomById,
  loadSubmissions,
  resumeDrawing,
  submitDrawing,
} from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRound } from '@/src/features/multiplayer/realtime';
import { useDeadlineCountdown } from '@/src/hooks/useDeadlineCountdown';
import { useReliablePhaseSync } from '@/src/hooks/useReliablePhaseSync';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import {
  DEFAULT_DRAWING_BRUSH_WIDTH,
  DEFAULT_DRAWING_COLOR,
} from '@/src/theme/drawingTools';
import { readableErrorTextColor } from '@/src/theme/contrast';
import { colors, radius } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';
import { getPromptPartLabel } from '@/src/features/multiplayer/types';
import type { CrocatDrawing, GameRole } from '@/src/types/game';


const blankDrawing = (): CrocatDrawing => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  strokes: [],
});

export default function OnlineDrawScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const {
    reset,
    userId,
    players,
    round,
    setRoomState,
  } = useOnlineGameStore();

  const params = useLocalSearchParams<{
    roomId: string;
    roundId: string;
    role: GameRole;
    seconds?: string;
    endsAt?: string;
  }>();

  const role: GameRole = params.role === 'BODY' ? 'BODY' : 'HEAD';
  const [drawing, setDrawing] = useState<CrocatDrawing>(blankDrawing);
  const [color, setColor] = useState(DEFAULT_DRAWING_COLOR);
  const [brushWidth, setBrushWidth] = useState(DEFAULT_DRAWING_BRUSH_WIDTH);
  const [waiting, setWaiting] = useState(false);
  const [otherSubmitted, setOtherSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const hydratedRef = useRef(false);
  const deadlineBusyRef = useRef(false);
  const lastClearedRef = useRef<CrocatDrawing | null>(null);

  const checkRoomState = useCallback(async () => {
    if (!params.roomId || !params.roundId) return;

    try {
      const [state, submissions] = await Promise.all([
        loadRoomById(params.roomId),
        loadSubmissions(params.roundId),
      ]);

      setRoomState(state.room, state.players, state.round);

      const me = userId
        ? state.players.find((player) => player.user_id === userId)
        : state.players.find((player) => player.role === role);
      const myRole = me?.role ?? role;

      const ownSubmission = submissions.find((item) => item.player_id === userId);
      const otherSubmission = submissions.find((item) => item.player_id !== userId);
      setOtherSubmitted(Boolean(otherSubmission?.submitted));

      if (!hydratedRef.current && ownSubmission) {
        hydratedRef.current = true;
        setDrawing(ownSubmission.drawing);
        setWaiting(Boolean(ownSubmission.submitted));
      }

      if (state.room.status === 'prompt_select' && state.round) {
        router.replace({
          pathname: '/online/prompt',
          params: { roomId: state.room.id, roundId: state.round.id },
        });
        return;
      }

      if (state.room.status === 'adjusting') {
        router.replace({
          pathname: '/online/adjust',
          params: { roundId: params.roundId, roomId: params.roomId, role: myRole },
        });
        return;
      }

      if (state.room.status === 'final_reveal' || state.room.status === 'reveal') {
        router.replace({
          pathname: '/online/reveal',
          params: { roundId: params.roundId, roomId: params.roomId },
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
  }, [params.roomId, params.roundId, reset, role, router, setRoomState, userId]);

  useReliablePhaseSync({
    roomId: params.roomId,
    roundId: params.roundId,
    screen: 'drawing',
    fallbackRole: role,
  });

  useEffect(() => {
    if (!params.roundId || !params.roomId) return;

    const realtime = subscribeToRound(params.roundId, params.roomId, () => {
      void checkRoomState();
    });
    void checkRoomState();

    return () => {
      void removeChannel(realtime);
    };
  }, [checkRoomState, params.roomId, params.roundId]);

  const deadlineFinish = useCallback(async () => {
    if (!params.roundId || deadlineBusyRef.current) return;
    deadlineBusyRef.current = true;

    try {
      setError('');
      await submitDrawing(params.roundId, role, drawing);
      setWaiting(true);
      await advanceDrawing(params.roundId);
      await checkRoomState();
    } catch {
      await checkRoomState();
    } finally {
      deadlineBusyRef.current = false;
    }
  }, [checkRoomState, drawing, params.roundId, role]);

  const timerWaiting =
    round?.id === params.roundId
    && round.phase_timer_started_at === null;
  const deadline =
    round?.id === params.roundId
      ? round.ends_at
      : params.endsAt;
  const countdownRemaining = useDeadlineCountdown(
    timerWaiting ? null : deadline,
    deadlineFinish,
    { clock: 'server' },
  );
  const configuredSeconds = Math.max(1, Number(params.seconds ?? 180));
  const remaining = timerWaiting ? configuredSeconds : countdownRemaining;

  const submitCurrent = async () => {
    if (!params.roundId || busy || remaining <= 0) return;
    try {
      setBusy(true);
      setError('');
      await submitDrawing(params.roundId, role, drawing);
      setWaiting(true);
      await checkRoomState();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit drawing.');
    } finally {
      setBusy(false);
    }
  };

  const returnToDrawing = async () => {
    if (!params.roundId || busy || remaining <= 0) return;
    try {
      setBusy(true);
      setError('');
      await resumeDrawing(params.roundId);
      setWaiting(false);
      await checkRoomState();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not return to drawing.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!params.roomId || busy) return;
    try {
      setBusy(true);
      await leaveRoom(params.roomId);
    } catch {
      // Returning home is still correct if the room disappeared first.
    } finally {
      reset();
      router.replace('/');
    }
  };

  const requestLeave = () => {
    if (!busy) setLeaveConfirmOpen(true);
  };

  const undo = () => setDrawing((current) => {
    if (current.strokes.length === 0 && lastClearedRef.current) {
      const restored = lastClearedRef.current;
      lastClearedRef.current = null;
      return restored;
    }

    return {
      ...current,
      strokes: current.strokes.slice(0, -1),
    };
  });

  const clear = () => setDrawing((current) => {
    if (current.strokes.length === 0) return current;
    lastClearedRef.current = current;
    return { ...current, strokes: [] };
  });

  const me = players.find((player) => player.user_id === userId);
  const playerName = me?.display_name ?? 'YOU';
  const otherName =
    players.find((player) => player.user_id !== userId)?.display_name ?? 'OTHER PLAYER';
  const promptTerm = round?.id === params.roundId ? round.prompt_term : null;
  const partLabel = getPromptPartLabel(round, role);

  const leaveModal = (
    <ConfirmActionModal
      visible={leaveConfirmOpen}
      title="Leave the game?"
      message="The current round will end for the room."
      confirmLabel="YES, LEAVE"
      cancelLabel="NO"
      busy={busy}
      onCancel={() => setLeaveConfirmOpen(false)}
      onConfirm={() => void leave()}
    />
  );

  const status = (
    <View style={[styles.status, otherSubmitted && styles.statusDone]}>
      <Text style={styles.statusText}>
        {otherSubmitted ? `${otherName} SUBMITTED ✓` : `${otherName} IS DRAWING…`}
      </Text>
    </View>
  );

  if (waiting) {
    return (
      <Screen scroll={false} contentStyle={styles.waitingScreen} backLabel="LEAVE" onBack={requestLeave} decorations="quiet">
        <View style={styles.waitingTop}>
          <View>
            <Text style={[styles.kicker, { color: world.colors.muted }]}>
              {playerName.toUpperCase()} · {partLabel.toUpperCase()} SUBMITTED
            </Text>
            {!!promptTerm && (
              <Text style={[styles.prompt, { color: world.colors.text }]}>DRAW · {promptTerm}</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            <CountdownBadge remaining={remaining} />
            {!!me?.profile && (
              <Mascot profile={profileToVisual(me.profile)} state="happy" size={42} />
            )}
          </View>
        </View>

        <View style={styles.waiting}>
          <Text style={[styles.waitTitle, { color: world.colors.text }, compact && styles.waitTitleCompact]}>
            Your version is saved.
          </Text>
          <Text style={[styles.waitCopy, { color: world.colors.muted }]}>
            You can keep it submitted or go back to the canvas and submit a newer version before time runs out.
          </Text>
          {status}
        </View>

        <CrocatButton
          variant="secondary"
          disabled={busy || remaining <= 0}
          onPress={returnToDrawing}
        >
          BACK TO DRAWING
        </CrocatButton>
        {!!error && (
          <Text style={[styles.error, { color: readableErrorTextColor(world.colors.background) }]}>
            {error}
          </Text>
        )}
        {leaveModal}
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]} backLabel="LEAVE" onBack={requestLeave} decorations="none">
      <View style={styles.top}>
        <View>
          <Text style={[styles.kicker, { color: world.colors.muted }]}>{playerName.toUpperCase()} · ONLINE</Text>
          <Text style={[styles.role, { color: world.colors.text }, compact && styles.roleCompact]}>{partLabel}</Text>
          {!!promptTerm && (
            <View style={styles.promptWrap}>
              <Text style={[styles.promptLabel, { color: world.colors.accent }]}>DRAW</Text>
              <Text style={[styles.promptTerm, { color: world.colors.text }]}>{promptTerm}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <CountdownBadge remaining={remaining} />
          {!!me?.profile && (
            <Mascot
              profile={profileToVisual(me.profile)}
              state={remaining <= 10 ? 'nervous' : 'drawing'}
              size={42}
            />
          )}
        </View>
      </View>

      <View style={styles.metaRow}>
        {status}
      </View>

      <View style={styles.canvasArea}>
        <DrawingCanvas
          role={role}
          drawing={drawing}
          onChange={setDrawing}
          color={color}
          brushWidth={brushWidth}
        />
      </View>

      <DrawingToolbar
        color={color}
        brushWidth={brushWidth}
        onColorChange={setColor}
        onBrushWidthChange={setBrushWidth}
        onUndo={undo}
        onClear={clear}
      />

      <CrocatButton disabled={busy || remaining <= 0} onPress={submitCurrent}>
        SUBMIT {partLabel.toUpperCase()}
      </CrocatButton>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {leaveModal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 8 },
  screenCompact: { gap: 6 },
  waitingScreen: { gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  waitingTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 },
  headerActions: { alignItems: 'center', gap: 5, flexShrink: 0 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3, color: colors.muted },
  role: { fontSize: 29, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  roleCompact: { fontSize: 25 },
  prompt: { marginTop: 4, color: colors.ink, fontWeight: '900', fontSize: 15 },
  promptWrap: { flexShrink: 0, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  promptLabel: { color: colors.coral, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  promptTerm: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 0 },
  hintWrap: { backgroundColor: colors.moss, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6, flexShrink: 1 },
  hint: { color: colors.ink, fontWeight: '700', fontSize: 10 },
  status: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  statusDone: { backgroundColor: colors.lime, borderColor: colors.ink },
  statusText: { color: colors.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  canvasArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  waitTitle: { fontSize: 38, lineHeight: 41, fontWeight: '900', letterSpacing: -1.4, color: colors.ink, textAlign: 'center' },
  waitTitleCompact: { fontSize: 32, lineHeight: 35 },
  waitCopy: { marginTop: 10, maxWidth: 460, color: colors.muted, lineHeight: 21, textAlign: 'center', fontSize: 14 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700', fontSize: 11 },
});
