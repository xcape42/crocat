import { useRouter } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { CrocatCard } from '@/src/components/CrocatCard';
import { Mascot } from '@/src/components/Mascot';
import { MascotSlot } from '@/src/components/MascotSlot';
import { Screen } from '@/src/components/Screen';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { spacing } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';

export default function HomeScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);

  return (
    <Screen decorations="full">
      <View style={styles.topRow}>
        <Text style={[styles.version, { color: world.colors.muted }]}>CROCAT 1.7.2</Text>
        <Text style={[styles.dot, { color: world.colors.accent }]}>●</Text>
      </View>

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <Text style={[styles.eyebrow, { color: world.colors.muted }]}>
          DRAW SOMETHING WEIRD TOGETHER
        </Text>
        <Text style={[styles.logo, compact && styles.logoCompact, { color: world.colors.text }]}>
          crocat.
        </Text>
        <Text style={[styles.subtitle, { color: world.colors.muted }]}>
          Half yours. Half theirs. One beautiful accident.
        </Text>

        <MascotSlot compact={compact}>
          <Mascot
            themeKey={themeKey}
            state="idle"
            size={compact ? 124 : 158}
            accessibilityLabel={world.mascot.name + ' from ' + world.label}
          />
        </MascotSlot>

        <CrocatCard variant="accent" style={styles.worldCard}>
          <Text style={[styles.worldKicker, { color: world.colors.muted }]}>YOUR WORLD</Text>
          <Text style={[styles.worldName, { color: world.colors.text }]}>{world.label}</Text>
          <Text style={[styles.worldCopy, { color: world.colors.muted }]}>{world.description}</Text>
        </CrocatCard>
      </View>

      <View style={styles.actions}>
        <CrocatButton onPress={() => router.push('/play')}>PLAY</CrocatButton>
        <View style={styles.row}>
          <CrocatButton variant="secondary" style={styles.flex} onPress={() => router.push('/friends')}>
            FRIENDS
          </CrocatButton>
          <CrocatButton variant="secondary" style={styles.flex} onPress={() => router.push('/gallery')}>
            GALLERY
          </CrocatButton>
        </View>
        <View style={styles.row}>
          <CrocatButton variant="ghost" style={styles.flex} onPress={() => router.push('/profile')}>
            PROFILE
          </CrocatButton>
          <CrocatButton variant="ghost" style={styles.flex} onPress={() => router.push('/settings')}>
            SETTINGS
          </CrocatButton>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  version: { fontSize: 12, fontWeight: '800', letterSpacing: 1.3 },
  dot: { fontSize: 18 },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  heroCompact: { paddingVertical: spacing.sm },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.7,
    marginBottom: 8,
    textAlign: 'center',
  },
  logo: { fontSize: 70, lineHeight: 76, fontWeight: '900', letterSpacing: -4 },
  logoCompact: { fontSize: 58, lineHeight: 62 },
  subtitle: {
    marginTop: 6,
    maxWidth: 420,
    fontSize: 17,
    lineHeight: 23,
    textAlign: 'center',
  },
  worldCard: {
    marginTop: 6,
    width: '100%',
    maxWidth: 390,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  worldKicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  worldName: { marginTop: 2, fontSize: 15, fontWeight: '900', letterSpacing: 0.6 },
  worldCopy: { marginTop: 3, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  actions: { gap: 10, paddingBottom: spacing.md },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
