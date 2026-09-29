import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
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
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const { currentRole, roundSeconds, submitDrawing, makeBlankDrawing, setPhase } = useGameStore();
  const [drawing, setDrawing] = useState<CrocatDrawing>(() => makeBlankDrawing());
  const [color, setColor] = useState(colors.ink);
  const [submitted, setSubmitted] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const lastClearedRef = useRef<CrocatDrawing | null>(null);

  const finish = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);
    const next = submitDrawing(drawing);
    router.replace(next === 'BODY' ? '/handoff' : '/reveal');
  }, [drawing, router, submitDrawing, submitted]);

  const leave = () => {
    setPhase('HOME');
    router.replace('/');
  };

  const undo = () => setDrawing((current) => {
    if (current.strokes.length === 0 && lastClearedRef.current) {
      const restored = lastClearedRef.current;
      lastClearedRef.current = null;
      return restored;
    }

    return { ...current, strokes: current.strokes.slice(0, -1) };
  });

  const clear = () => setDrawing((current) => {
    if (current.strokes.length === 0) return current;
    lastClearedRef.current = current;
    return { ...current, strokes: [] };
  });

  return (
    <Screen
      scroll={false}
      contentStyle={[styles.screen, compact && styles.screenCompact]}
      backLabel="LEAVE"
      onBack={() => setLeaveConfirmOpen(true)}
      decorations="none"
    >
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>{currentRole === 'HEAD' ? 'DOMI · YOUR PART' : 'SARAH · YOUR PART'}</Text>
          <Text style={[styles.role, compact && styles.roleCompact]}>{currentRole}</Text>
        </View>
        <Timer seconds={roundSeconds} onComplete={finish} />
      </View>

      <View style={styles.hintWrap}>
        <Text style={styles.hint}>
          {currentRole === 'HEAD'
            ? 'Draw the head. Connection line: bottom.'
            : 'Draw the body. Connection line: top.'}
        </Text>
      </View>

      <View style={styles.canvasArea}>
        <DrawingCanvas role={currentRole} drawing={drawing} onChange={setDrawing} color={color} />
      </View>

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
      <ConfirmActionModal
        visible={leaveConfirmOpen}
        title="Leave the game?"
        message="Your current local round will be abandoned."
        confirmLabel="YES, LEAVE"
        cancelLabel="NO"
        onCancel={() => setLeaveConfirmOpen(false)}
        onConfirm={leave}
      />
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
});
