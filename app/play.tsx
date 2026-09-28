import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CrocatButton } from '@/src/components/CrocatButton';
import { CrocatCard } from '@/src/components/CrocatCard';
import { Mascot } from '@/src/components/Mascot';
import { Screen } from '@/src/components/Screen';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { spacing } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';

export default function PlayScreen() {
  const router = useRouter();
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);

  return (
    <Screen backLabel="HOME" decorations="full">
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={[styles.kicker, { color: world.colors.accent }]}>PICK A WAY TO PLAY</Text>
          <Text style={[styles.title, { color: world.colors.text }]}>Choose your chaos.</Text>
          <Text style={[styles.copy, { color: world.colors.muted }]}>
            Your world follows you. The game stays simple.
          </Text>
        </View>
        <Mascot themeKey={themeKey} state="happy" size={82} />
      </View>

      <View style={styles.stack}>
        <CrocatCard variant="accent" style={styles.card}>
          <Text style={[styles.badge, { color: world.colors.muted }]}>PRIMARY · ONLINE</Text>
          <Text style={[styles.mode, { color: world.colors.text }]}>Split Online</Text>
          <Text style={[styles.modeCopy, { color: world.colors.muted }]}>
            Create a fresh room or enter a room code. Meet another Crocat world inside.
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.meta, { color: world.colors.muted, borderColor: world.colors.line }]}>2 DEVICES</Text>
            <Text style={[styles.meta, { color: world.colors.muted, borderColor: world.colors.line }]}>REALTIME</Text>
          </View>
          <CrocatButton variant="coral" onPress={() => router.push('/online')}>
            PLAY ONLINE
          </CrocatButton>
        </CrocatCard>

        <CrocatCard variant="surface" style={styles.card}>
          <Text style={[styles.badge, { color: world.colors.muted }]}>LOCAL</Text>
          <Text style={[styles.modeSmall, { color: world.colors.text }]}>Split Local</Text>
          <Text style={[styles.modeCopy, { color: world.colors.muted }]}>
            Two people, one device. Draw one half, pass it over, reveal at the end.
          </Text>
          <CrocatButton variant="secondary" onPress={() => router.push('/lobby')}>
            PLAY LOCAL
          </CrocatButton>
        </CrocatCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroCopy: { flex: 1 },
  kicker: { fontWeight: '900', letterSpacing: 1.3, fontSize: 10 },
  title: {
    marginTop: 5,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.8,
    fontWeight: '900',
  },
  copy: { marginTop: 8, fontSize: 15, lineHeight: 21 },
  stack: { gap: 14, paddingBottom: 24 },
  card: { padding: spacing.lg, gap: 13 },
  badge: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  mode: { fontSize: 38, fontWeight: '900', letterSpacing: -1.4 },
  modeSmall: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  modeCopy: { fontSize: 14, lineHeight: 21 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  meta: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 9,
    fontWeight: '800',
  },
});
