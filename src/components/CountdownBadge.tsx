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
      <Text style={styles.time}>{min}:{sec}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 82,
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  warning: {
    backgroundColor: colors.lime,
  },
  critical: {
    backgroundColor: colors.coral,
    transform: [{ scale: 1.06 }],
  },
  label: {
    color: colors.ink,
    fontWeight: '900',
    fontSize: 8,
    letterSpacing: 0.7,
  },
  time: {
    color: colors.white,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    fontSize: 16,
  },
});
