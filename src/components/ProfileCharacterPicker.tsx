import { useMemo, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Mascot } from '@/src/components/Mascot';
import type {
  MascotCharacterKey,
  ProfileVisual,
} from '@/src/features/profile/types';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { readableTextColor } from '@/src/theme/contrast';
import {
  MASCOT_CHARACTER_OPTIONS,
  type MascotState,
} from '@/src/theme/mascots';
import { radius } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';

type Props = {
  profile: ProfileVisual;
  characterKey: MascotCharacterKey;
  onCharacterChange: (key: MascotCharacterKey) => void;
};

const EMOTIONS: ReadonlyArray<{ state: MascotState; label: string }> = [
  { state: 'idle', label: 'IDLE' },
  { state: 'happy', label: 'HAPPY' },
  { state: 'shy', label: 'SHY' },
  { state: 'curious', label: 'CURIOUS' },
  { state: 'waiting', label: 'WAITING' },
  { state: 'drawing', label: 'DRAWING' },
  { state: 'nervous', label: 'NERVOUS' },
  { state: 'excited', label: 'EXCITED' },
  { state: 'proud', label: 'PROUD' },
  { state: 'celebrate', label: 'CELEBRATE' },
  { state: 'sleeping', label: 'SLEEPY' },
];

export function ProfileCharacterPicker({
  profile,
  characterKey,
  onCharacterChange,
}: Props) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const [previewState, setPreviewState] = useState<MascotState>('idle');

  const index = Math.max(
    0,
    MASCOT_CHARACTER_OPTIONS.findIndex((item) => item.key === characterKey),
  );
  const character = MASCOT_CHARACTER_OPTIONS[index];

  const selectOffset = (offset: number) => {
    const nextIndex =
      (index + offset + MASCOT_CHARACTER_OPTIONS.length)
      % MASCOT_CHARACTER_OPTIONS.length;
    onCharacterChange(MASCOT_CHARACTER_OPTIONS[nextIndex].key);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12
          && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -36) selectOffset(1);
          if (gesture.dx >= 36) selectOffset(-1);
        },
      }),
    [index, onCharacterChange],
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: world.colors.card,
          borderColor: world.colors.line,
        },
      ]}
    >
      <View style={styles.previewRow} {...panResponder.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous mascot character"
          hitSlop={8}
          onPress={() => selectOffset(-1)}
          style={({ pressed }) => [
            styles.arrow,
            { borderColor: world.colors.line },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.arrowText, { color: world.colors.text }]}>‹</Text>
        </Pressable>

        <View style={styles.preview}>
          <Mascot
            profile={{ ...profile, mascotCharacterKey: character.key }}
            state={previewState}
            size={126}
          />
          <Text style={[styles.characterName, { color: world.colors.text }]}>
            {character.label}
          </Text>
          <Text style={[styles.counter, { color: world.colors.muted }]}>
            {index + 1} / {MASCOT_CHARACTER_OPTIONS.length}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next mascot character"
          hitSlop={8}
          onPress={() => selectOffset(1)}
          style={({ pressed }) => [
            styles.arrow,
            { borderColor: world.colors.line },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.arrowText, { color: world.colors.text }]}>›</Text>
        </Pressable>
      </View>

      <Text style={[styles.description, { color: world.colors.muted }]}>
        {character.description}
      </Text>

      <View style={styles.traits}>
        {character.traits.map((trait) => (
          <View
            key={trait}
            style={[
              styles.trait,
              {
                backgroundColor: world.colors.secondary,
                borderColor: world.colors.line,
              },
            ]}
          >
            <Text style={[styles.traitText, { color: readableTextColor(world.colors.secondary) }]}>
              {trait}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.divider,
          { backgroundColor: world.colors.line },
        ]}
      />

      <Text style={[styles.emotionTitle, { color: world.colors.muted }]}>
        TRY AN EMOTION
      </Text>
      <View style={styles.emotions}>
        {EMOTIONS.map((emotion) => {
          const selected = previewState === emotion.state;
          return (
            <Pressable
              key={emotion.state}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setPreviewState(emotion.state)}
              style={({ pressed }) => [
                styles.emotion,
                {
                  backgroundColor: selected
                    ? world.colors.primary
                    : world.colors.surface,
                  borderColor: selected
                    ? world.colors.text
                    : world.colors.line,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.emotionText,
                  {
                    color: readableTextColor(
                      selected ? world.colors.primary : world.colors.surface,
                    ),
                    opacity: selected ? 1 : 0.72,
                  },
                ]}
              >
                {emotion.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.swipeHint, { color: world.colors.muted }]}>
        Swipe the mascot or use the arrows to change character.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: 10,
  },
  previewRow: {
    minHeight: 164,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  preview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  arrow: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    marginTop: -2,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '700',
  },
  characterName: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  counter: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  description: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  traits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  trait: {
    minHeight: 26,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
  },
  traitText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginVertical: 2,
  },
  emotionTitle: {
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  emotions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  emotion: {
    minHeight: 30,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
  },
  emotionText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  swipeHint: {
    marginTop: 2,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 13,
  },
  pressed: {
    opacity: 0.58,
  },
});
