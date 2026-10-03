import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { readableTextColor } from '@/src/theme/contrast';
import { crocatWorld } from '@/src/theme/worlds';

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
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
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
          { color: world.colors.text },
          Platform.OS === 'web' && ({ userSelect: 'text' } as never),
        ]}
      >
        {normalized}
      </Text>
      <View style={styles.actions}>
        {([
          ['code', copied === 'code' ? 'COPIED ✓' : 'COPY CODE', copyCode],
          ['link', copied === 'link' ? 'COPIED ✓' : 'COPY LINK', copyLink],
        ] as const).map(([key, label, action]) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={key === 'code' ? 'Copy room code' : 'Copy room link'}
            onPress={action}
            style={({ pressed }) => [
              styles.copyButton,
              {
                borderColor: world.colors.text,
                backgroundColor: pressed ? world.colors.primary : world.colors.surface,
                borderRadius: world.shapes.buttonRadius,
              },
            ]}
          >
            {({ pressed }) => (
              <Text
                style={[
                  styles.copyText,
                  {
                    color: readableTextColor(
                      pressed ? world.colors.primary : world.colors.surface,
                    ),
                  },
                ]}
              >
                {label}
              </Text>
            )}
          </Pressable>
        ))}
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
  },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  copyButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  copyText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
});
