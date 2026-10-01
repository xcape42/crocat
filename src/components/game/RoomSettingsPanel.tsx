import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CrocatCard } from '@/src/components/CrocatCard';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { crocatWorld } from '@/src/theme/worlds';

const ROUND_OPTIONS = [60, 120, 180, 300];

type Props = {
  roundSeconds: number;
  editable: boolean;
  busy?: boolean;
  onChange?: (seconds: number) => void;
};

export function RoomSettingsPanel({
  roundSeconds,
  editable,
  busy = false,
  onChange,
}: Props) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);

  return (
    <CrocatCard variant="surface" style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: world.colors.accent }]}>GAME SETTINGS</Text>
          <Text style={[styles.title, { color: world.colors.text }]}>
            {editable ? 'Shared room settings' : 'Room configuration'}
          </Text>
        </View>
        <Text style={[styles.mode, { color: world.colors.muted }]}>
          {editable ? 'ALL PLAYERS' : 'LOCKED'}
        </Text>
      </View>

      <View style={styles.setting}>
        <View>
          <Text style={[styles.label, { color: world.colors.muted }]}>ROUND TIME</Text>
          <Text style={[styles.value, { color: world.colors.text }]}>
            {Math.round(roundSeconds / 60)} MIN
          </Text>
        </View>

        {editable ? (
          <View style={styles.options}>
            {ROUND_OPTIONS.map((seconds) => {
              const active = roundSeconds === seconds;
              return (
                <Pressable
                  key={seconds}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => onChange?.(seconds)}
                  style={[
                    styles.option,
                    {
                      borderColor: active ? world.colors.text : world.colors.line,
                      backgroundColor: active ? world.colors.primary : world.colors.canvas,
                      borderRadius: world.shapes.buttonRadius,
                    },
                  ]}
                >
                  <Text style={[styles.optionText, { color: world.colors.text }]}>
                    {seconds / 60}m
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View
            style={[
              styles.readonly,
              {
                borderColor: world.colors.line,
                backgroundColor: world.colors.canvas,
                borderRadius: world.shapes.buttonRadius,
              },
            ]}
          >
            <Text style={[styles.readonlyText, { color: world.colors.text }]}>
              {Math.round(roundSeconds / 60)} MINUTES
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.note, { color: world.colors.muted }]}>
        Changing a room setting resets Ready states. Future round modifiers will live here too.
      </Text>
    </CrocatCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 16, marginTop: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { marginTop: 3, fontSize: 18, fontWeight: '900' },
  mode: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  setting: { gap: 10 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  value: { marginTop: 2, fontSize: 14, fontWeight: '900' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    minWidth: 54,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  optionText: { fontWeight: '900' },
  readonly: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  readonlyText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  note: { fontSize: 11, lineHeight: 15 },
});
