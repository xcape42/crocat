import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import { useGameStore } from '@/src/store/gameStore';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { colors, radius } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';
import type { GameRole } from '@/src/types/game';

function ZoomControls({ role }: { role: GameRole }) {
  const { scalePart } = useGameStore();

  const button = (label: string, accessibilityLabel: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.control}
    >
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.controlGroup}>
      <Text style={styles.controlTitle}>{role} · ZOOM</Text>
      <View style={styles.controlRow}>
        {button('−', `${role} zoom out`, () => scalePart(role, -0.05))}
        {button('+', `${role} zoom in`, () => scalePart(role, 0.05))}
      </View>
    </View>
  );
}

export default function FinalizeScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const {
    head,
    body,
    headTransform,
    bodyTransform,
    nudgePart,
    setPhase,
  } = useGameStore();
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const leave = () => {
    setPhase('HOME');
    router.replace('/');
  };

  const finish = () => {
    setPhase('RESULT');
    router.replace('/result');
  };

  return (
    <Screen
      scroll={false}
      contentStyle={[styles.screen, compact && styles.screenCompact]}
      backLabel="LEAVE"
      onBack={() => setLeaveConfirmOpen(true)}
      decorations="none"
    >
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: world.colors.accent }]}>REVEAL</Text>
        <Text style={[styles.title, { color: world.colors.text }, compact && styles.titleCompact]}>
          A beautiful accident.
        </Text>
        <Text style={[styles.copy, { color: world.colors.muted }, compact && styles.copyCompact]}>
          Drag HEAD or BODY directly. Use − / + only to adjust the zoom.
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
        />
      </View>

      <View style={styles.controls}>
        <ZoomControls role="HEAD" />
        <ZoomControls role="BODY" />
      </View>

      <CrocatButton onPress={finish}>LOCK IT IN</CrocatButton>
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
    gap: 8,
    justifyContent: 'center',
  },
  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  controlTitle: {
    fontSize: 9,
    color: colors.muted,
    fontWeight: '900',
    letterSpacing: 1,
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
  controlText: { fontWeight: '900', color: colors.ink, fontSize: 18 },
});
