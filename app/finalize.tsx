import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import { useGameStore } from '@/src/store/gameStore';
import { colors, radius } from '@/src/theme/tokens';
import type { GameRole } from '@/src/types/game';

function Controls({ role }: { role: GameRole }) {
  const { nudgePart, scalePart } = useGameStore();
  const button = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={styles.control}>
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.controlGroup}>
      <Text style={styles.controlTitle}>{role}</Text>
      <View style={styles.controlRow}>
        {button('←', () => nudgePart(role, -8, 0))}
        {button('↑', () => nudgePart(role, 0, -8))}
        {button('↓', () => nudgePart(role, 0, 8))}
        {button('→', () => nudgePart(role, 8, 0))}
        {button('−', () => scalePart(role, -0.05))}
        {button('+', () => scalePart(role, 0.05))}
      </View>
    </View>
  );
}

export default function FinalizeScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const {
    head,
    body,
    headTransform,
    bodyTransform,
    nudgePart,
    setPhase,
  } = useGameStore();

  const finish = () => {
    setPhase('RESULT');
    router.replace('/result');
  };

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]}>
      <View style={styles.header}>
        <Text style={styles.kicker}>REVEAL</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>A beautiful accident.</Text>
        <Text style={[styles.copy, compact && styles.copyCompact]}>
          Drag HEAD or BODY directly. Use the controls for fine adjustments and scaling.
        </Text>
      </View>

      <View style={styles.previewArea}>
        <DrawingPreview
          head={head}
          body={body}
          headTransform={headTransform}
          bodyTransform={bodyTransform}
          interactive
          onMovePart={nudgePart}
          maxHeightRatio={compact ? 0.40 : 0.48}
        />
      </View>

      <View style={styles.controls}>
        <Controls role="HEAD" />
        <Controls role="BODY" />
      </View>

      <CrocatButton onPress={finish}>LOCK IT IN</CrocatButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 10 },
  screenCompact: { gap: 7 },
  header: { gap: 3, flexShrink: 0 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.5, fontSize: 11 },
  title: { fontSize: 32, lineHeight: 36, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  titleCompact: { fontSize: 27, lineHeight: 30 },
  copy: { color: colors.muted, lineHeight: 19, fontSize: 14 },
  copyCompact: { fontSize: 12, lineHeight: 16 },
  previewArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  controls: {
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'center',
  },
  controlGroup: {
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  controlTitle: {
    fontSize: 9,
    color: colors.muted,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  controlRow: { flexDirection: 'row', gap: 5 },
  control: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: { fontWeight: '900', color: colors.ink, fontSize: 16 },
});
