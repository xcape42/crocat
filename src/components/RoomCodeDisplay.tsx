import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { colors, radius } from '@/src/theme/tokens';

type Props = {
  code: string;
};

type CopiedValue = 'code' | 'link' | null;

function getRoomLink(code: string) {
  if (Platform.OS === 'web') {
    const location = (globalThis as typeof globalThis & {
      location?: { origin?: string; pathname?: string };
    }).location;

    if (location?.origin && location.pathname) {
      return `${location.origin}${location.pathname}`;
    }
  }

  return Linking.createURL(`online/room/${code}`);
}

export function RoomCodeDisplay({ code }: Props) {
  const normalized = code.trim().toUpperCase();
  const [copied, setCopied] = useState<CopiedValue>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const markCopied = (value: Exclude<CopiedValue, null>) => {
    setCopied(value);

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(null), 1800);
  };

  const copyCode = async () => {
    await Clipboard.setStringAsync(normalized);
    markCopied('code');
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(getRoomLink(normalized));
    markCopied('link');
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
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy room code"
          onPress={copyCode}
          style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
        >
          <Text style={styles.copyText}>{copied === 'code' ? 'COPIED ✓' : 'COPY CODE'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy room link"
          onPress={copyLink}
          style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}
        >
          <Text style={styles.copyText}>{copied === 'link' ? 'COPIED ✓' : 'COPY LINK'}</Text>
        </Pressable>
      </View>
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
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
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
