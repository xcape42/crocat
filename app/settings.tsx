import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/src/components/Screen';
import { colors, radius, spacing } from '@/src/theme/tokens';

const futureSettings = [
  { label: 'THEME', value: 'SYSTEM', note: 'Light / dark themes will live here.' },
  { label: 'SOUND', value: 'DEFAULT', note: 'Music and sound-effect volume will live here.' },
  { label: 'ACCESSIBILITY', value: 'DEFAULT', note: 'General accessibility preferences will live here.' },
];

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.back()}>← HOME</Text>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.copy}>General Crocat preferences live here. Settings for a specific game belong to that game room.</Text>

      <View style={styles.stack}>
        {futureSettings.map((setting) => (
          <View key={setting.label} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{setting.label}</Text>
              <Text style={styles.value}>{setting.value}</Text>
            </View>
            <Text style={styles.note}>{setting.note}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  title: { marginTop: spacing.xl, fontSize: 48, fontWeight: '900', letterSpacing: -2, color: colors.ink },
  copy: { marginTop: 10, color: colors.muted, lineHeight: 21 },
  stack: { marginTop: spacing.xl, gap: 12 },
  card: { padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { color: colors.ink, fontWeight: '900', letterSpacing: 1, fontSize: 11 },
  value: { color: colors.muted, fontWeight: '900', fontSize: 11 },
  note: { color: colors.muted, lineHeight: 18, fontSize: 12 },
});
