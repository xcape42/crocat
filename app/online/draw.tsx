import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingCanvas } from '@/src/components/DrawingCanvas';
import { Screen } from '@/src/components/Screen';
import { Timer } from '@/src/components/Timer';
import { loadRound, submitDrawing } from '@/src/features/multiplayer/room';
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
    seconds: string;
  }>();
  const role: GameRole = params.role === 'BODY' ? 'BODY' : 'HEAD';
  const seconds = Math.max(10, Number(params.seconds) || 180);
  const [drawing, setDrawing] = useState<CrocatDrawing>(() => blankDrawing());
  const [color, setColor] = useState(colors.ink);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const checkRound = useCallback(async () => {
    if (!params.roundId) return;
    const round = await loadRound(params.roundId);
    if (round.status === 'reveal' || round.status === 'finished') {
      router.replace({
        pathname: '/online/reveal',
        params: { roomId: params.roomId, roundId: params.roundId },
      });
    }
  }, [params.roomId, params.roundId, router]);

  useEffect(() => {
    if (!params.roundId) return;
    let channel: RealtimeChannel | null = subscribeToRound(params.roundId, () => {
      void checkRound();
    });
    void checkRound();
    return () => { void removeChannel(channel); channel = null; };
  }, [checkRound, params.roundId]);

  const finish = useCallback(async () => {
    if (submitted || !params.roundId) return;
    try {
      setError('');
      setSubmitted(true);
      await submitDrawing(params.roundId, role, drawing);
      await checkRound();
    } catch (e) {
      setSubmitted(false);
      setError(e instanceof Error ? e.message : 'Could not submit drawing.');
    }
  }, [checkRound, drawing, params.roundId, role, submitted]);

  const title = useMemo(() => role === 'HEAD' ? 'HEAD' : 'BODY', [role]);

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>ONLINE · YOUR PART</Text>
          <Text style={styles.role}>{title}</Text>
        </View>
        {!submitted && <Timer seconds={seconds} onComplete={finish} />}
        {submitted && <View style={styles.waitPill}><Text style={styles.waitPillText}>SENT ✓</Text></View>}
      </View>

      <View style={styles.hintWrap}>
        <Text style={styles.hint}>
          {submitted
            ? 'Waiting for the other half. You cannot see it yet.'
            : role === 'HEAD'
              ? 'Draw the head. Your friend is drawing the body on another device.'
              : 'Draw the body. Your friend is drawing the head on another device.'}
        </Text>
      </View>

      <DrawingCanvas drawing={drawing} onChange={setDrawing} color={color} />

      <View style={styles.toolbar}>
        <View style={styles.palette}>
          {palette.map((item) => (
            <Pressable
              key={item}
              disabled={submitted}
              onPress={() => setColor(item)}
              style={[styles.swatch, { backgroundColor: item }, color === item && styles.swatchActive]}
            />
          ))}
        </View>
        <Pressable disabled={submitted} onPress={() => setDrawing((current) => ({ ...current, strokes: current.strokes.slice(0, -1) }))}>
          <Text style={styles.tool}>UNDO</Text>
        </Pressable>
        <Pressable disabled={submitted} onPress={() => setDrawing((current) => ({ ...current, strokes: [] }))}>
          <Text style={styles.tool}>CLEAR</Text>
        </Pressable>
      </View>

      <CrocatButton disabled={submitted} onPress={finish}>
        {submitted ? 'WAITING FOR FRIEND…' : 'SUBMIT MY HALF'}
      </CrocatButton>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: colors.coral },
  role: { fontSize: 30, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  waitPill: { backgroundColor: colors.moss, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  waitPillText: { fontWeight: '900', color: colors.ink, fontSize: 12 },
  hintWrap: { backgroundColor: colors.blue, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' },
  hint: { color: colors.ink, fontWeight: '700', fontSize: 12 },
  toolbar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  palette: { flexDirection: 'row', gap: 8 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.paper },
  swatchActive: { borderColor: colors.ink, transform: [{ scale: 1.1 }] },
  tool: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, color: colors.muted },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700' },
});
