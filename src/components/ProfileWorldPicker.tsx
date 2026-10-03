import { useMemo } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CrocatWorldKey } from '@/src/features/profile/types';
import { radius } from '@/src/theme/tokens';
import { WORLD_OPTIONS } from '@/src/theme/worlds';

type Props = {
  worldKey: CrocatWorldKey;
  onWorldChange: (key: CrocatWorldKey) => void;
};

const previewSpots = [
  { top: 16, left: 18, size: 28, rotate: '-12deg' },
  { top: 30, right: 24, size: 22, rotate: '8deg' },
  { bottom: 26, left: 34, size: 20, rotate: '14deg' },
  { bottom: 18, right: 40, size: 30, rotate: '-7deg' },
  { top: 70, left: '48%', size: 16, rotate: '4deg' },
] as const;

export function ProfileWorldPicker({
  worldKey,
  onWorldChange,
}: Props) {
  const index = Math.max(
    0,
    WORLD_OPTIONS.findIndex((world) => world.key === worldKey),
  );
  const world = WORLD_OPTIONS[index];

  const selectOffset = (offset: number) => {
    const nextIndex =
      (index + offset + WORLD_OPTIONS.length) % WORLD_OPTIONS.length;
    onWorldChange(WORLD_OPTIONS[nextIndex].key);
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
    [index, onWorldChange],
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
      <View
        style={[
          styles.scene,
          {
            backgroundColor: world.colors.background,
            borderColor: world.colors.line,
          },
        ]}
        {...panResponder.panHandlers}
      >
        {previewSpots.map((spot, spotIndex) => (
          <Text
            key={spotIndex}
            style={[
              styles.fragment,
              spot,
              {
                color:
                  spotIndex % 3 === 0
                    ? world.colors.primary
                    : spotIndex % 3 === 1
                      ? world.colors.accent
                      : world.colors.pattern,
                opacity: 0.32,
                transform: [{ rotate: spot.rotate }],
              },
            ]}
          >
            {world.background.fragments[
              spotIndex % world.background.fragments.length
            ]}
          </Text>
        ))}

        <View
          style={[
            styles.surface,
            {
              backgroundColor: world.colors.surface,
              borderColor: world.colors.line,
            },
          ]}
        >
          <View style={styles.worldTop}>
            <View>
              <Text style={[styles.worldName, { color: world.colors.text }]}>
                {world.label}
              </Text>
              <Text style={[styles.worldCounter, { color: world.colors.muted }]}>
                {index + 1} / {WORLD_OPTIONS.length}
              </Text>
            </View>
            <View
              style={[
                styles.accent,
                {
                  backgroundColor: world.colors.accent,
                  borderColor: world.colors.text,
                },
              ]}
            />
          </View>

          <Text style={[styles.pattern, { color: world.colors.pattern }]}>
            {world.background.glyphs.join('  ')}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous Crocat World"
          hitSlop={8}
          onPress={() => selectOffset(-1)}
          style={({ pressed }) => [
            styles.arrow,
            styles.arrowLeft,
            {
              backgroundColor: world.colors.card,
              borderColor: world.colors.line,
            },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.arrowText, { color: world.colors.text }]}>‹</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next Crocat World"
          hitSlop={8}
          onPress={() => selectOffset(1)}
          style={({ pressed }) => [
            styles.arrow,
            styles.arrowRight,
            {
              backgroundColor: world.colors.card,
              borderColor: world.colors.line,
            },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.arrowText, { color: world.colors.text }]}>›</Text>
        </Pressable>
      </View>

      <Text style={[styles.description, { color: world.colors.muted }]}>
        {world.description}
      </Text>

      <View style={styles.palette}>
        {[
          world.colors.primary,
          world.colors.secondary,
          world.colors.accent,
          world.colors.pattern,
        ].map((color, colorIndex) => (
          <View
            key={colorIndex}
            style={[
              styles.swatch,
              {
                backgroundColor: color,
                borderColor: world.colors.line,
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.hint, { color: world.colors.muted }]}>
        Swipe the World or use the arrows. Your mascot stays independent.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: 10,
  },
  scene: {
    minHeight: 212,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.lg,
    justifyContent: 'center',
    paddingHorizontal: 58,
  },
  fragment: {
    position: 'absolute',
    fontWeight: '900',
  },
  surface: {
    minHeight: 126,
    padding: 16,
    borderWidth: 1,
    borderRadius: radius.md,
    justifyContent: 'space-between',
  },
  worldTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  worldName: {
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900',
    letterSpacing: 1,
  },
  worldCounter: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  accent: {
    width: 42,
    height: 18,
    borderWidth: 1,
    borderRadius: 999,
  },
  pattern: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 6,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    width: 42,
    height: 42,
    marginTop: -21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 21,
  },
  arrowLeft: {
    left: 10,
  },
  arrowRight: {
    right: 10,
  },
  arrowText: {
    marginTop: -2,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '700',
  },
  description: {
    paddingHorizontal: 4,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  palette: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  swatch: {
    width: 30,
    height: 12,
    borderWidth: 1,
    borderRadius: 999,
  },
  hint: {
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 13,
  },
  pressed: {
    opacity: 0.58,
  },
});
