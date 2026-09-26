import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors, radius } from '@/src/theme/tokens';

type Props = {
  code: string;
};

export function RoomCodeDisplay({ code }: Props) {
  const normalized = code.trim().toUpperCase();
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(normalized);
    setCopied(true);

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <View style={styles.row}>
      <Text
        selectable
        style={[
          styles.code,
          Platform.OS === 'web' && ({ userSelect: 'text' } as never),
        ]}
      >
        {normalized}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy room code"
        onPress={copy}
        style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
      >
        <Text style={styles.copyText}>{copied ? 'COPIED ✓' : 'COPY CODE'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  code: {
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: 5,
    color: colors.ink,
  },
  copyButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.card,
  },
  copyButtonPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: colors.lime,
  },
  copyText: {
    color: colors.ink,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
