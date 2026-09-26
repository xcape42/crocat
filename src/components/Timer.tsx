import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDeadlineCountdown, type DeadlineValue } from '@/src/hooks/useDeadlineCountdown';
import { colors, radius } from '@/src/theme/tokens';

type Props = {
  seconds: number;
  endsAt?: DeadlineValue;
  onComplete: () => void;
};

export function Timer({ seconds, endsAt, onComplete }: Props) {
  const [localDeadline, setLocalDeadline] = useState(() => Date.now() + seconds * 1000);

  useEffect(() => {
    if (endsAt == null) {
      setLocalDeadline(Date.now() + seconds * 1000);
    }
  }, [endsAt, seconds]);

  const deadline = useMemo(
    () => endsAt ?? localDeadline,
    [endsAt, localDeadline],
  );
  const remaining = useDeadlineCountdown(deadline, onComplete);

  const min = Math.floor(remaining / 60).toString().padStart(2, '0');
  const sec = (remaining % 60).toString().padStart(2, '0');

  return (
    <View style={styles.pill}>
      <Text style={styles.text}>{min}:{sec}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  text: { color: colors.white, fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: 16 },
});
