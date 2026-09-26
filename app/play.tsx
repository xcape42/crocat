import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function PlayScreen() {
  const router = useRouter();
  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.back()}>← HOME</Text>
      <View style={styles.hero}>
        <Text style={styles.title}>Choose your chaos.</Text>
        <Text style={styles.copy}>Play together on one device or open an online room for two devices.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.badge}><Text style={styles.badgeText}>ORIGINAL</Text></View>
        <Text style={styles.mode}>Split</Text>
        <Text style={styles.modeCopy}>One head. One body. One reveal.</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>2 PLAYERS</Text>
          <Text style={styles.meta}>3 MIN</Text>
          <Text style={styles.meta}>CO-OP</Text>
        </View>
        <View style={styles.actions}>
          <CrocatButton style={styles.flex} onPress={() => router.push('/lobby')}>LOCAL</CrocatButton>
          <CrocatButton variant="coral" style={styles.flex} onPress={() => router.push('/online')}>ONLINE</CrocatButton>
        </View>
      </View>

      <View style={styles.locked}>
        <Text style={styles.lockedTitle}>Online is the 1.1.0 workstream.</Text>
        <Text style={styles.lockedCopy}>Guest identity, room codes, live presence and two-device drawing are now isolated from the stable local mode.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  hero: { marginTop: spacing.xxl, marginBottom: spacing.xl },
  title: { fontSize: 48, lineHeight: 52, letterSpacing: -2, fontWeight: '900', color: colors.ink },
  copy: { marginTop: 10, color: colors.muted, fontSize: 17, lineHeight: 24 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.ink, padding: spacing.lg, gap: 16 },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.moss, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  mode: { fontSize: 42, fontWeight: '900', color: colors.ink, letterSpacing: -1.5 },
  modeCopy: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  meta: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: '800', color: colors.muted },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  locked: { marginTop: 18, backgroundColor: colors.blue, borderRadius: radius.md, padding: 18 },
  lockedTitle: { fontWeight: '900', fontSize: 17, color: colors.ink },
  lockedCopy: { marginTop: 4, color: colors.ink, opacity: 0.7, lineHeight: 20 },
});
