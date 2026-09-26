import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { colors } from '@/src/theme/tokens';

export default function RevealScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.kicker}>BOTH HALVES ARE IN</Text>
        <Text style={styles.eyes}>◉   ◉</Text>
        <Text style={styles.title}>Meet your Crocat.</Text>
        <Text style={styles.copy}>No more secrets. Time for the reveal.</Text>
      </View>
      <CrocatButton variant="coral" onPress={() => router.replace('/finalize')}>REVEAL</CrocatButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.muted, fontWeight: '900', letterSpacing: 1.6, fontSize: 11 },
  eyes: { fontSize: 54, marginVertical: 22, color: colors.ink },
  title: { fontSize: 46, fontWeight: '900', letterSpacing: -1.8, color: colors.ink, textAlign: 'center' },
  copy: { marginTop: 10, fontSize: 17, color: colors.muted },
});
