import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/src/theme/tokens';

type Props = {
  seconds: number;
  onComplete: () => void;
};

export function Timer({ seconds, onComplete }: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const fired = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((value) => {
        const next = Math.max(0, value - 1);
        if (next === 0 && !fired.current) {
          fired.current = true;
          setTimeout(() => completeRef.current(), 0);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

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
