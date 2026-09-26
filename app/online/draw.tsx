import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingCanvas } from '@/src/components/DrawingCanvas';
import { Screen } from '@/src/components/Screen';
import { Timer } from '@/src/components/Timer';
import { loadSubmissions, submitDrawing } from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRound } from '@/src/features/multiplayer/realtime';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing, GameRole } from '@/src/types/game';

const palette = [colors.ink, '#DB5C46', '#477A91', '#6A8E3A'];

const blankDrawing = (): CrocatDrawing => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  strokes: [],
});

export default function OnlineDrawScreen() {
  const router = useRouter();
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

  const checkReveal = useCallback(async () => {
    if (!params.roundId) return;
    const submissions = await loadSubmissions(params.roundId);
    if (submissions.length >= 2) {
      router.replace({
        pathname: '/online/reveal',
        params: { roundId: params.roundId, roomId: params.roomId },
      });
    }
  }, [params.roomId, params.roundId, router]);

  useEffect(() => {
    if (!params.roundId) return;

    const realtime = subscribeToRound(params.roundId, () => {
      void checkReveal();
    });
    void checkReveal();

    return () => {
      void removeChannel(realtime);
    };
  }, [checkReveal, params.roundId]);

  const finish = useCallback(async () => {
    if (submitted || !params.roundId) return;
    try {
      setSubmitted(true);
      setError('');
      await submitDrawing(params.roundId, role, drawing);
      setWaiting(true);
      await checkReveal();
    } catch (e) {
      setSubmitted(false);
      setError(e instanceof Error ? e.message : 'Could not submit drawing.');
    }
  }, [checkReveal, drawing, params.roundId, role, submitted]);

  const undo = () => setDrawing((current) => ({
    ...current,
    strokes: current.strokes.slice(0, -1),
  }));

  if (waiting) {
    return (
      <Screen>
        <View style={styles.waiting}>
          <Text style={styles.kicker}>{playerName.toUpperCase()} · {role} SUBMITTED</Text>
          <Text style={styles.waitTitle}>Your half is hidden.</Text>
          <Text style={styles.waitCopy}>Waiting for the other player. The reveal starts automatically when both drawings arrive.</Text>
          <View style={styles.pulse}><Text style={styles.pulseText}>•••</Text></View>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>{playerName.toUpperCase()} · ONLINE</Text>
          <Text style={styles.role}>{role}</Text>
        </View>
        <Timer seconds={initialSeconds} onComplete={finish} />
      </View>

      <View style={styles.hintWrap}>
        <Text style={styles.hint}>
          {role === 'HEAD'
            ? 'Draw the head. The dashed connection line is at the bottom.'
            : 'Draw the body. The dashed connection line is at the top.'}
        </Text>
      </View>

      <DrawingCanvas role={role} drawing={drawing} onChange={setDrawing} color={color} />

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
  screen: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: colors.muted },
  role: { fontSize: 30, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  hintWrap: { backgroundColor: colors.moss, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' },
  hint: { color: colors.ink, fontWeight: '700', fontSize: 12 },
  toolbar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  palette: { flexDirection: 'row', gap: 8 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.paper },
  swatchActive: { borderColor: colors.ink, transform: [{ scale: 1.1 }] },
  tool: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, color: colors.muted },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  waitTitle: { marginTop: 10, fontSize: 42, lineHeight: 45, fontWeight: '900', letterSpacing: -1.5, color: colors.ink, textAlign: 'center' },
  waitCopy: { marginTop: 12, maxWidth: 440, color: colors.muted, lineHeight: 22, textAlign: 'center', fontSize: 16 },
  pulse: { marginTop: 28, minWidth: 86, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.card, alignItems: 'center' },
  pulseText: { fontSize: 22, fontWeight: '900', letterSpacing: 5, color: colors.ink },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700' },
});
