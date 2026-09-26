import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingCanvas } from '@/src/components/DrawingCanvas';
import { Screen } from '@/src/components/Screen';
import { Timer } from '@/src/components/Timer';
import { loadRoomById, submitDrawing } from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRound } from '@/src/features/multiplayer/realtime';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors, radius } from '@/src/theme/tokens';
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
  const { reset } = useOnlineGameStore();
  const params = useLocalSearchParams<{
    roomId: string;
    roundId: string;
    role: GameRole;
    seconds?: string;
    endsAt?: string;
  }>();

  const role: GameRole = params.role === 'BODY' ? 'BODY' : 'HEAD';
  const playerName = role === 'HEAD' ? 'Domi' : 'Sarah';
  const fallbackSeconds = Math.max(10, Number(params.seconds ?? 180));
  const initialSeconds = params.endsAt
    ? Math.max(1, Math.ceil((new Date(params.endsAt).getTime() - Date.now()) / 1000))
    : fallbackSeconds;

  const [drawing, setDrawing] = useState<CrocatDrawing>(blankDrawing);
  const [color, setColor] = useState(colors.ink);
  const [submitted, setSubmitted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');

  const checkRoomState = useCallback(async () => {
    if (!params.roomId || !params.roundId) return;

    try {
      const state = await loadRoomById(params.roomId);

      if (state.room.status === 'reveal') {
        router.replace({
          pathname: '/online/reveal',
          params: { roundId: params.roundId, roomId: params.roomId },
        });
        return;
      }

      if (state.room.status === 'waiting') {
        router.replace(`/online/room/${state.room.code}`);
        return;
      }

      if (state.room.status === 'drawing' && state.round && state.round.id !== params.roundId) {
        const me = state.players.find((player) => player.role === role);
        if (!me) return;

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
      }
    } catch {
      reset();
      router.replace('/');
    }
  }, [params.roomId, params.roundId, reset, role, router]);

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

  const finish = useCallback(async () => {
    if (submitted || !params.roundId) return;
    try {
      setSubmitted(true);
      setError('');
      await submitDrawing(params.roundId, role, drawing);
      setWaiting(true);
      await checkRoomState();
    } catch (e) {
      setSubmitted(false);
      setError(e instanceof Error ? e.message : 'Could not submit drawing.');
    }
  }, [checkRoomState, drawing, params.roundId, role, submitted]);

  const undo = () => setDrawing((current) => ({
    ...current,
    strokes: current.strokes.slice(0, -1),
  }));

  if (waiting) {
    return (
      <Screen scroll={false}>
        <View style={styles.waiting}>
          <Text style={styles.kicker}>{playerName.toUpperCase()} · {role} SUBMITTED</Text>
          <Text style={[styles.waitTitle, compact && styles.waitTitleCompact]}>Your half is hidden.</Text>
          <Text style={styles.waitCopy}>Waiting for the other player. The shared reveal starts automatically when both drawings arrive.</Text>
          <View style={styles.pulse}><Text style={styles.pulseText}>•••</Text></View>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]}>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>{playerName.toUpperCase()} · ONLINE</Text>
          <Text style={[styles.role, compact && styles.roleCompact]}>{role}</Text>
        </View>
        <Timer seconds={initialSeconds} onComplete={finish} />
      </View>

      <View style={styles.hintWrap}>
        <Text style={styles.hint}>
          {role === 'HEAD'
            ? 'Draw the head. Connection line: bottom.'
            : 'Draw the body. Connection line: top.'}
        </Text>
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

      <CrocatButton disabled={submitted} onPress={finish}>SUBMIT {role}</CrocatButton>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 10 },
  screenCompact: { gap: 7 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: colors.muted },
  role: { fontSize: 30, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  roleCompact: { fontSize: 26 },
  hintWrap: { backgroundColor: colors.moss, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start', flexShrink: 0 },
  hint: { color: colors.ink, fontWeight: '700', fontSize: 11 },
  canvasArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  toolbar: { minHeight: 46, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  palette: { flexDirection: 'row', gap: 7 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.paper },
  swatchActive: { borderColor: colors.ink, transform: [{ scale: 1.08 }] },
  tool: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7, color: colors.muted },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  waitTitle: { marginTop: 10, fontSize: 42, lineHeight: 45, fontWeight: '900', letterSpacing: -1.5, color: colors.ink, textAlign: 'center' },
  waitTitleCompact: { fontSize: 34, lineHeight: 37 },
  waitCopy: { marginTop: 12, maxWidth: 440, color: colors.muted, lineHeight: 22, textAlign: 'center', fontSize: 16 },
  pulse: { marginTop: 28, minWidth: 86, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.card, alignItems: 'center' },
  pulseText: { fontSize: 22, fontWeight: '900', letterSpacing: 5, color: colors.ink },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700' },
});
