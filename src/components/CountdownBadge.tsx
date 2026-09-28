import { StyleSheet, Text, View } from 'react-native';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { crocatWorld } from '@/src/theme/worlds';

type Props = {
  remaining: number;
  label?: string;
};

export function CountdownBadge({ remaining, label }: Props) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const safeRemaining = Number.isFinite(remaining)
    ? Math.max(0, Math.floor(remaining))
    : 0;
  const warning = safeRemaining <= 10;
  const critical = safeRemaining <= 5;

  const min = Math.floor(safeRemaining / 60).toString().padStart(2, '0');
  const sec = (safeRemaining % 60).toString().padStart(2, '0');
  const backgroundColor = critical
    ? world.colors.accent
    : warning
      ? world.colors.primary
      : world.colors.text;
  const foreground = warning ? world.colors.text : world.colors.card;

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor,
          borderColor: world.colors.text,
          borderRadius: world.shapes.buttonRadius,
          borderWidth: critical ? 3 : world.shapes.borderWidth,
        },
      ]}
    >
      <Text style={[styles.label, { color: foreground }]}>
        {critical ? 'HURRY' : (warning ? 'LAST SECONDS' : (label ?? 'TIME'))}
      </Text>
      <Text style={[styles.time, { color: foreground }]}>{min}:{sec}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 98,
    height: 58,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 8,
  },
  label: {
    width: '100%',
    fontWeight: '900',
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.55,
    textAlign: 'center',
    includeFontPadding: false,
  },
  time: {
    width: '100%',
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    fontSize: 17,
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
