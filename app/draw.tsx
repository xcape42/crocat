import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingCanvas } from '@/src/components/DrawingCanvas';
import { Screen } from '@/src/components/Screen';
import { Timer } from '@/src/components/Timer';
import { useGameStore } from '@/src/store/gameStore';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing } from '@/src/types/game';

const palette = [colors.ink, '#DB5C46', '#477A91', '#6A8E3A'];

export default function DrawScreen() {
  const router = useRouter();
  const { currentRole, roundSeconds, submitDrawing, makeBlankDrawing } = useGameStore();
  const [drawing, setDrawing] = useState<CrocatDrawing>(() => makeBlankDrawing());
  const [color, setColor] = useState(colors.ink);
  const [submitted, setSubmitted] = useState(false);

  const finish = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);
    const next = submitDrawing(drawing);
    router.replace(next === 'BODY' ? '/handoff' : '/reveal');
  }, [drawing, router, submitDrawing, submitted]);

  const undo = () => setDrawing((current) => ({ ...current, strokes: current.strokes.slice(0, -1) }));
  const clear = () => setDrawing((current) => ({ ...current, strokes: [] }));

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>{currentRole === 'HEAD' ? 'DOMI · YOUR PART' : 'SARAH · YOUR PART'}</Text>
          <Text style={styles.role}>{currentRole}</Text>
        </View>
        <Timer seconds={roundSeconds} onComplete={finish} />
      </View>

      <View style={styles.hintWrap}>
        <Text style={styles.hint}>
          {currentRole === 'HEAD'
            ? 'Draw the head. The dashed connection line is at the bottom.'
            : 'Draw the body. The dashed connection line is at the top.'}
        </Text>
      </View>

      <DrawingCanvas role={currentRole} drawing={drawing} onChange={setDrawing} color={color} />

      <View style={styles.toolbar}>
        <View style={styles.palette}>
          {palette.map((item) => (
            <Pressable key={item} onPress={() => setColor(item)} style={[styles.swatch, { backgroundColor: item }, color === item && styles.swatchActive]} />
          ))}
        </View>
        <Pressable onPress={undo}><Text style={styles.tool}>UNDO</Text></Pressable>
        <Pressable onPress={clear}><Text style={styles.tool}>CLEAR</Text></Pressable>
      </View>

      <CrocatButton disabled={drawing.strokes.length === 0 || submitted} onPress={finish}>I'M DONE</CrocatButton>
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
});
