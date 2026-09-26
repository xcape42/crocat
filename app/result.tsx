import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import { useGameStore } from '@/src/store/gameStore';
import { colors } from '@/src/theme/tokens';

export default function ResultScreen() {
  const router = useRouter();
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
    <Screen contentStyle={styles.screen}>
      <View>
        <Text style={styles.kicker}>CROCAT COMPLETE</Text>
        <Text style={styles.title}>Look what you made.</Text>
      </View>

      <DrawingPreview
        head={head}
        body={body}
        headTransform={headTransform}
        bodyTransform={bodyTransform}
        maxHeightRatio={0.52}
      />

      <View style={styles.row}>
        <CrocatButton style={styles.flex} onPress={replay}>PLAY AGAIN</CrocatButton>
        <CrocatButton variant="secondary" style={styles.flex} onPress={home}>HOME</CrocatButton>
      </View>
      <Text style={styles.note}>Saving, sharing and the Crocat gallery are prepared as next-step features.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.5, fontSize: 11 },
  title: { fontSize: 36, fontWeight: '900', letterSpacing: -1.2, color: colors.ink },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  flex: { flexGrow: 1, minWidth: 150 },
  note: { textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 18 },
});
