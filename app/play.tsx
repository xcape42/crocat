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
        <Text style={styles.copy}>Play Split locally on one device or online on two devices.</Text>
      </View>

      <View style={styles.stack}>
        <View style={styles.card}>
          <View style={styles.badge}><Text style={styles.badgeText}>ORIGINAL · LOCAL</Text></View>
          <Text style={styles.mode}>Split</Text>
          <Text style={styles.modeCopy}>Domi draws HEAD, then Sarah draws BODY on the same device. Reveal and align at the end.</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>2 PLAYERS</Text>
            <Text style={styles.meta}>LOCAL</Text>
            <Text style={styles.meta}>PASS DEVICE</Text>
          </View>
          <CrocatButton onPress={() => router.push('/lobby')}>PLAY LOCAL</CrocatButton>
        </View>

        <View style={[styles.card, styles.onlineCard]}>
          <View style={[styles.badge, { backgroundColor: colors.coral }]}><Text style={styles.badgeText}>1.1.1 · ONLINE</Text></View>
          <Text style={styles.mode}>Split Online</Text>
          <Text style={styles.modeCopy}>Create a room code, join from a second device and draw HEAD + BODY at the same time.</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>2 DEVICES</Text>
            <Text style={styles.meta}>REALTIME</Text>
            <Text style={styles.meta}>ROOM CODE</Text>
          </View>
          <CrocatButton variant="coral" onPress={() => router.push('/online')}>PLAY ONLINE</CrocatButton>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  hero: { marginTop: spacing.xxl, marginBottom: spacing.xl },
  title: { fontSize: 48, lineHeight: 52, letterSpacing: -2, fontWeight: '900', color: colors.ink },
  copy: { marginTop: 10, color: colors.muted, fontSize: 17, lineHeight: 24 },
  stack: { gap: 14, paddingBottom: 24 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.ink, padding: spacing.lg, gap: 16 },
  onlineCard: { backgroundColor: '#FFF7F2' },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.moss, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  mode: { fontSize: 40, fontWeight: '900', color: colors.ink, letterSpacing: -1.5 },
  modeCopy: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  meta: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: '800', color: colors.muted }
});
