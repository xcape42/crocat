import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/src/components/Screen';
import { useGameStore } from '@/src/store/gameStore';
import { colors, radius, spacing } from '@/src/theme/tokens';

const options = [60, 120, 180, 300];

export default function SettingsScreen() {
  const router = useRouter();
  const { roundSeconds, setRoundSeconds } = useGameStore();
  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.back()}>← HOME</Text>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.label}>ROUND TIME</Text>
      <View style={styles.row}>
        {options.map((seconds) => (
          <Pressable key={seconds} onPress={() => setRoundSeconds(seconds)} style={[styles.option, roundSeconds === seconds && styles.active]}>
            <Text style={styles.optionText}>{seconds / 60}m</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>More accessibility, brush and room settings will live here later.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  title: { marginTop: spacing.xl, fontSize: 48, fontWeight: '900', letterSpacing: -2, color: colors.ink },
  label: { marginTop: spacing.xl, marginBottom: 10, color: colors.muted, fontWeight: '900', letterSpacing: 1.2, fontSize: 11 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { minWidth: 76, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.card },
  active: { borderColor: colors.ink, backgroundColor: colors.lime },
  optionText: { fontWeight: '900', color: colors.ink },
  note: { marginTop: 18, color: colors.muted },
});
