import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingCanvas } from '@/src/components/DrawingCanvas';
import { DrawingToolbar } from '@/src/components/DrawingToolbar';
import { Screen } from '@/src/components/Screen';
import { Timer } from '@/src/components/Timer';
import { useGameStore } from '@/src/store/gameStore';
import {
  DEFAULT_DRAWING_BRUSH_WIDTH,
  DEFAULT_DRAWING_COLOR,
} from '@/src/theme/drawingTools';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing } from '@/src/types/game';


export default function DrawScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const { currentRole, roundSeconds, submitDrawing, makeBlankDrawing, setPhase } = useGameStore();
  const [drawing, setDrawing] = useState<CrocatDrawing>(() => makeBlankDrawing());
  const [color, setColor] = useState(DEFAULT_DRAWING_COLOR);
  const [brushWidth, setBrushWidth] = useState(DEFAULT_DRAWING_BRUSH_WIDTH);
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
        <DrawingCanvas
          role={currentRole}
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
});
