import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { colors, spacing } from '@/src/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.topRow}>
        <Text style={styles.version}>CROCAT 1.6.6</Text>
        <Text style={styles.dot}>●</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>DRAW SOMETHING WEIRD TOGETHER</Text>
        <Text style={styles.logo}>crocat.</Text>
        <Text style={styles.subtitle}>Half yours. Half theirs. One beautiful accident.</Text>
        <View style={styles.creature}>
          <Image
            source={require('../assets/images/7886F04F-D43C-4DD5-AF91-BA1F78D30DF9.png')}
            style={styles.creatureImage}
            resizeMode="contain"
            accessibilityLabel="Crocat mascot"
          />
        </View>
      </View>

      <View style={styles.actions}>
        <CrocatButton onPress={() => router.push('/play')}>PLAY</CrocatButton>
        <View style={styles.row}>
          <CrocatButton variant="secondary" style={styles.flex} onPress={() => router.push('/friends')}>FRIENDS</CrocatButton>
          <CrocatButton variant="secondary" style={styles.flex} onPress={() => router.push('/gallery')}>GALLERY</CrocatButton>
        </View>
        <View style={styles.row}>
          <CrocatButton variant="ghost" style={styles.flex} onPress={() => router.push('/profile')}>PROFILE</CrocatButton>
          <CrocatButton variant="ghost" style={styles.flex} onPress={() => router.push('/settings')}>SETTINGS</CrocatButton>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  version: { fontSize: 12, fontWeight: '800', letterSpacing: 1.3, color: colors.muted },
  dot: { color: colors.coral, fontSize: 18 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xl },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.8, color: colors.muted, marginBottom: 10, textAlign: 'center' },
  logo: { fontSize: 72, lineHeight: 78, fontWeight: '900', letterSpacing: -4, color: colors.ink },
  subtitle: { marginTop: 8, maxWidth: 420, fontSize: 18, lineHeight: 25, color: colors.muted, textAlign: 'center' },
  creature: { marginTop: 34, width: 420, height: 420, alignItems: 'center', justifyContent: 'center'},
  creatureImage: { width: '88%', height: '88%' },
  actions: { gap: 12, paddingBottom: spacing.md },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
