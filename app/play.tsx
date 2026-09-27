import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { colors, radius, spacing } from '@/src/theme/tokens';

export default function PlayScreen() {
  const router = useRouter();

  return (
    <Screen backLabel="HOME">

      <View style={styles.hero}>
        <Text style={styles.title}>Choose your chaos.</Text>
        <Text style={styles.copy}>
          Play online with a room code or keep it local on one device.
        </Text>
      </View>

      <View style={styles.stack}>
        <View style={[styles.card, styles.onlineCard]}>
          <View style={[styles.badge, { backgroundColor: colors.coral }]}>
            <Text style={styles.badgeText}>PRIMARY · ONLINE</Text>
          </View>
          <Text style={styles.mode}>Split Online</Text>
          <Text style={styles.modeCopy}>
            Create a fresh room or enter a room code. Invite friends once you are inside.
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>2 DEVICES</Text>
            <Text style={styles.meta}>REALTIME</Text>
          </View>
          <CrocatButton variant="coral" onPress={() => router.push('/online')}>
            PLAY ONLINE
          </CrocatButton>
        </View>

        <View style={[styles.card, styles.localCard]}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>LOCAL</Text>
          </View>
          <Text style={styles.modeSmall}>Split Local</Text>
          <Text style={styles.modeCopy}>
            Two people, one device. Draw one half, pass it over, reveal at the end.
          </Text>
          <CrocatButton variant="secondary" onPress={() => router.push('/lobby')}>
            PLAY LOCAL
          </CrocatButton>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  hero: { marginTop: spacing.xl, marginBottom: spacing.lg },
  title: {
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.8,
    fontWeight: '900',
    color: colors.ink,
  },
  copy: { marginTop: 8, color: colors.muted, fontSize: 16, lineHeight: 22 },
  stack: { gap: 14, paddingBottom: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: spacing.lg,
    gap: 14,
  },
  onlineCard: { backgroundColor: '#FFF7F2' },
  localCard: { borderColor: colors.line },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.moss,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  mode: { fontSize: 40, fontWeight: '900', color: colors.ink, letterSpacing: -1.5 },
  modeSmall: { fontSize: 30, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  modeCopy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  meta: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
  },
});
