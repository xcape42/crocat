import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import { useGameStore } from '@/src/store/gameStore';
import { colors, radius } from '@/src/theme/tokens';
import type { GameRole } from '@/src/types/game';

function Controls({ role }: { role: GameRole }) {
  const { nudgePart, scalePart } = useGameStore();
  const button = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={styles.control}><Text style={styles.controlText}>{label}</Text></Pressable>
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
  const { head, body, headTransform, bodyTransform, setPhase } = useGameStore();
  const finish = () => {
    setPhase('RESULT');
    router.replace('/result');
  };

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.kicker}>REVEAL</Text>
        <Text style={styles.title}>A beautiful accident.</Text>
        <Text style={styles.copy}>Nudge the halves until the connection feels just right.</Text>
      </View>
      <DrawingPreview head={head} body={body} headTransform={headTransform} bodyTransform={bodyTransform} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlsScroll}>
        <Controls role="HEAD" />
        <Controls role="BODY" />
      </ScrollView>
      <CrocatButton onPress={finish}>LOCK IT IN</CrocatButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  header: { gap: 4 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.5, fontSize: 11 },
  title: { fontSize: 34, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  copy: { color: colors.muted, lineHeight: 20 },
  controlsScroll: { gap: 10, paddingVertical: 2 },
  controlGroup: { backgroundColor: colors.card, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  controlTitle: { fontSize: 10, color: colors.muted, fontWeight: '900', letterSpacing: 1.1, marginBottom: 8 },
  controlRow: { flexDirection: 'row', gap: 6 },
  control: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  controlText: { fontWeight: '900', color: colors.ink, fontSize: 17 },
});
