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
      <Text style={styles.label}>
        {critical ? 'HURRY' : (warning ? 'LAST SECONDS' : (label ?? 'TIME'))}
      </Text>
      <Text style={[styles.time, warning && styles.timeWarning]}>{min}:{sec}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 92,
    height: 54,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  warning: {
    backgroundColor: colors.lime,
  },
  critical: {
    backgroundColor: colors.coral,
    transform: [{ scale: 1.04 }],
  },
  label: {
    width: '100%',
    color: colors.ink,
    fontWeight: '900',
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.6,
    textAlign: 'center',
    includeFontPadding: false,
  },
  time: {
    width: '100%',
    marginTop: 1,
    color: colors.white,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'center',
    includeFontPadding: false,
  },
  timeWarning: { color: colors.ink },
});
