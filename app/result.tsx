import { useRouter } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import { useGameStore } from '@/src/store/gameStore';
import { colors } from '@/src/theme/tokens';

export default function ResultScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const { head, body, headTransform, bodyTransform, resetRound, setPhase } = useGameStore();

  const replay = () => {
    resetRound();
    router.replace('/lobby');
  };

  const home = () => {
    setPhase('HOME');
    router.replace('/');
  };

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]} backLabel="HOME" onBack={home}>
      <View style={styles.header}>
        <Text style={styles.kicker}>CROCAT COMPLETE</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>Look what you made.</Text>
      </View>

      <View style={styles.previewArea}>
        <DrawingPreview
          head={head}
          body={body}
          headTransform={headTransform}
          bodyTransform={bodyTransform}
        />
      </View>

      <View style={styles.row}>
        <CrocatButton style={styles.flex} onPress={replay}>PLAY AGAIN</CrocatButton>
        <CrocatButton variant="secondary" style={styles.flex} onPress={home}>HOME</CrocatButton>
      </View>
      {!compact && (
        <Text style={styles.note}>Saving, sharing and the Crocat gallery are prepared as next-step features.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 10 },
  screenCompact: { gap: 7 },
  header: { flexShrink: 0 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.5, fontSize: 11 },
  title: { fontSize: 36, lineHeight: 40, fontWeight: '900', letterSpacing: -1.2, color: colors.ink },
  titleCompact: { fontSize: 30, lineHeight: 33 },
  previewArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, flexShrink: 0 },
  flex: { flex: 1 },
  note: { textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 0 },
});
