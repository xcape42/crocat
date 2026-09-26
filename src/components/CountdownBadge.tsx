import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/src/theme/tokens';

type Props = {
  remaining: number;
  label?: string;
};

export function CountdownBadge({ remaining, label }: Props) {
  const warning = remaining <= 10;
  const critical = remaining <= 5;

  const min = Math.floor(remaining / 60).toString().padStart(2, '0');
  const sec = (remaining % 60).toString().padStart(2, '0');

  return (
    <View style={[
      styles.pill,
      warning && styles.warning,
      critical && styles.critical,
    ]}>
      <Text style={[styles.label, warning && styles.labelWarning]}>
        {critical ? 'HURRY' : (warning ? 'LAST SECONDS' : (label ?? 'TIME'))}
      </Text>
      <Text style={[styles.time, warning && styles.timeWarning]}>{min}:{sec}</Text>
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
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: 8,
    paddingVertical: 0,
  },
  warning: {
    backgroundColor: colors.lime,
  },
  critical: {
    backgroundColor: colors.coral,
    borderWidth: 3,
  },
  label: {
    width: '100%',
    color: colors.white,
    fontWeight: '900',
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.55,
    textAlign: 'center',
    includeFontPadding: false,
  },
  labelWarning: { color: colors.ink },
  time: {
    width: '100%',
    color: colors.white,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    fontSize: 17,
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
  timeWarning: { color: colors.ink },
});
