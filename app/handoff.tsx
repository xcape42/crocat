import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { colors, spacing } from '@/src/theme/tokens';

export default function HandoffScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.kicker}>DON'T PEEK.</Text>
        <Text style={styles.icon}>↝</Text>
        <Text style={styles.title}>Pass it to Player 2.</Text>
        <Text style={styles.copy}>The head is safely hidden. Player 2 gets the BODY and a fresh canvas.</Text>
      </View>
      <CrocatButton onPress={() => router.replace('/draw')}>I'M PLAYER 2</CrocatButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  icon: { fontSize: 84, lineHeight: 100, color: colors.ink },
  title: { fontSize: 44, lineHeight: 48, fontWeight: '900', letterSpacing: -1.8, color: colors.ink, textAlign: 'center' },
  copy: { marginTop: 12, maxWidth: 420, textAlign: 'center', fontSize: 17, lineHeight: 24, color: colors.muted },
});
