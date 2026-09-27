import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
import { CountdownBadge } from '@/src/components/CountdownBadge';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingCanvas } from '@/src/components/DrawingCanvas';
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
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors, radius } from '@/src/theme/tokens';
import { getPromptPartLabel } from '@/src/features/multiplayer/types';
import type { CrocatDrawing, GameRole } from '@/src/types/game';

const palette = [colors.ink, '#DB5C46', '#477A91', '#6A8E3A'];

const blankDrawing = (): CrocatDrawing => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  strokes: [],
});

export default function OnlineDrawScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
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
  const [color, setColor] = useState(colors.ink);
  const [waiting, setWaiting] = useState(false);
  const [otherSubmitted, setOtherSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const hydratedRef = useRef(false);
  const deadlineBusyRef = useRef(false);

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

  const deadline =
    round?.id === params.roundId
      ? round.ends_at
      : params.endsAt;
  const remaining = useDeadlineCountdown(deadline, deadlineFinish, { clock: 'server' });

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

  const undo = () => setDrawing((current) => ({
    ...current,
    strokes: current.strokes.slice(0, -1),
  }));

  const playerName =
    players.find((player) => player.user_id === userId)?.display_name ?? 'YOU';
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
      <Screen scroll={false} contentStyle={styles.waitingScreen} backLabel="LEAVE" onBack={requestLeave}>
        <View style={styles.waitingTop}>
          <View>
            <Text style={styles.kicker}>{playerName.toUpperCase()} · {partLabel.toUpperCase()} SUBMITTED</Text>
            {!!promptTerm && <Text style={styles.prompt}>DRAW · {promptTerm}</Text>}
          </View>
          <View style={styles.headerActions}>
            <CountdownBadge remaining={remaining} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={requestLeave}>
              <Text style={styles.leave}>LEAVE ROUND</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.waiting}>
          <Text style={[styles.waitTitle, compact && styles.waitTitleCompact]}>Your version is saved.</Text>
          <Text style={styles.waitCopy}>
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
        {!!error && <Text style={styles.error}>{error}</Text>}
        {leaveModal}
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]} backLabel="LEAVE" onBack={requestLeave}>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>{playerName.toUpperCase()} · ONLINE</Text>
          <Text style={[styles.role, compact && styles.roleCompact]}>{partLabel}</Text>
        </View>
        <View style={styles.headerActions}>
          <CountdownBadge remaining={remaining} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={requestLeave}>
            <Text style={styles.leave}>LEAVE ROUND</Text>
          </Pressable>
        </View>
      </View>

      {!!promptTerm && (
        <View style={styles.promptWrap}>
          <Text style={styles.promptLabel}>DRAW</Text>
          <Text style={styles.promptTerm}>{promptTerm}</Text>
        </View>
      )}

      <View style={styles.metaRow}>
        <View style={styles.hintWrap}>
          <Text style={styles.hint}>
            {role === 'HEAD'
              ? `Draw: ${partLabel}. Connection line: bottom.`
              : `Draw: ${partLabel}. Connection line: top.`}
          </Text>
        </View>
        {status}
      </View>

      <View style={styles.canvasArea}>
        <DrawingCanvas role={role} drawing={drawing} onChange={setDrawing} color={color} />
      </View>

      <View style={styles.toolbar}>
        <View style={styles.palette}>
          {palette.map((item) => (
            <Pressable
              key={item}
              onPress={() => setColor(item)}
              style={[styles.swatch, { backgroundColor: item }, color === item && styles.swatchActive]}
            />
          ))}
        </View>
        <Pressable onPress={undo}><Text style={styles.tool}>UNDO</Text></Pressable>
        <Pressable onPress={() => setDrawing(blankDrawing())}><Text style={styles.tool}>CLEAR</Text></Pressable>
      </View>

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
  leave: { color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.7, textAlign: 'center' },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3, color: colors.muted },
  role: { fontSize: 29, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  roleCompact: { fontSize: 25 },
  prompt: { marginTop: 4, color: colors.ink, fontWeight: '900', fontSize: 15 },
  promptWrap: { flexShrink: 0, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  promptLabel: { color: colors.coral, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  promptTerm: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 7, flexShrink: 0 },
  hintWrap: { backgroundColor: colors.moss, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6, flexShrink: 1 },
  hint: { color: colors.ink, fontWeight: '700', fontSize: 10 },
  status: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  statusDone: { backgroundColor: colors.lime, borderColor: colors.ink },
  statusText: { color: colors.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  canvasArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  toolbar: { minHeight: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  palette: { flexDirection: 'row', gap: 7 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.paper },
  swatchActive: { borderColor: colors.ink, transform: [{ scale: 1.08 }] },
  tool: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7, color: colors.muted },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  waitTitle: { fontSize: 38, lineHeight: 41, fontWeight: '900', letterSpacing: -1.4, color: colors.ink, textAlign: 'center' },
  waitTitleCompact: { fontSize: 32, lineHeight: 35 },
  waitCopy: { marginTop: 10, maxWidth: 460, color: colors.muted, lineHeight: 21, textAlign: 'center', fontSize: 14 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700', fontSize: 11 },
});
