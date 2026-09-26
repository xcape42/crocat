import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/src/theme/tokens';

const ROUND_OPTIONS = [60, 120, 180, 300];

type Props = {
  roundSeconds: number;
  editable: boolean;
  busy?: boolean;
  onChange?: (seconds: number) => void;
};

export function RoomSettingsPanel({ roundSeconds, editable, busy = false, onChange }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>GAME SETTINGS</Text>
          <Text style={styles.title}>{editable ? 'Configure this room' : 'Room configuration'}</Text>
        </View>
        <Text style={styles.mode}>{editable ? 'HOST' : 'VIEW ONLY'}</Text>
      </View>

      <View style={styles.setting}>
        <View>
          <Text style={styles.label}>ROUND TIME</Text>
          <Text style={styles.value}>{Math.round(roundSeconds / 60)} MIN</Text>
        </View>

        {editable ? (
          <View style={styles.options}>
            {ROUND_OPTIONS.map((seconds) => (
              <Pressable
                key={seconds}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => onChange?.(seconds)}
                style={[styles.option, roundSeconds === seconds && styles.active]}
              >
                <Text style={styles.optionText}>{seconds / 60}m</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.readonly}>
            <Text style={styles.readonlyText}>{Math.round(roundSeconds / 60)} MINUTES</Text>
          </View>
        )}
      </View>

      <Text style={styles.note}>
        Future round modifiers and mode-specific rules will live here too.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  eyebrow: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { marginTop: 3, color: colors.ink, fontSize: 18, fontWeight: '900' },
  mode: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  setting: { gap: 10 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  value: { marginTop: 2, color: colors.ink, fontSize: 14, fontWeight: '900' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    minWidth: 54,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  active: { borderColor: colors.ink, backgroundColor: colors.lime },
  optionText: { color: colors.ink, fontWeight: '900' },
  readonly: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  readonlyText: { color: colors.ink, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  note: { color: colors.muted, fontSize: 11, lineHeight: 15 },
});
