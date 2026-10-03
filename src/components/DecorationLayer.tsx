import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { crocatWorld } from '@/src/theme/worlds';

type Props = {
  intensity?: 'quiet' | 'full';
  celebrate?: boolean;
  depth?: 'back' | 'front';
};

const backSpots = [
  { top: '6%', left: '7%', scale: 1.15 },
  { top: '15%', right: '6%', scale: 1.45 },
  { top: '35%', left: '3%', scale: 0.95 },
  { top: '52%', right: '4%', scale: 1.25 },
  { bottom: '18%', left: '10%', scale: 1.4 },
  { bottom: '5%', right: '15%', scale: 1.05 },
] as const;

const frontSpots = [
  { top: '23%', right: '-1%', scale: 1.65 },
  { bottom: '13%', left: '-1%', scale: 1.5 },
] as const;

const fallingSeeds = [
  { left: '8%', delay: 0, scale: 0.9, drift: 18 },
  { left: '27%', delay: 1600, scale: 1.2, drift: -12 },
  { left: '51%', delay: 3200, scale: 0.8, drift: 10 },
  { left: '74%', delay: 800, scale: 1.35, drift: -16 },
  { left: '91%', delay: 2500, scale: 1, drift: 8 },
] as const;

function FallingFragment({
  glyph,
  color,
  height,
  left,
  delay,
  duration,
  drift,
  scale,
  opacity,
  front,
}: {
  glyph: string;
  color: string;
  height: number;
  left: `${number}%`;
  delay: number;
  duration: number;
  drift: number;
  scale: number;
  opacity: number;
  front: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);

    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    animation.start();
    return () => animation.stop();
  }, [delay, duration, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-72, height + 72],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, drift, 0],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-18deg', '22deg'],
  });

  return (
    <Animated.Text
      style={[
        styles.falling,
        {
          left,
          color,
          opacity,
          fontSize: (front ? 31 : 24) * scale,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    >
      {glyph}
    </Animated.Text>
  );
}

export function DecorationLayer({
  intensity = 'quiet',
  celebrate = false,
  depth = 'back',
}: Props) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const reducedMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    drift.stopAnimation();
    drift.setValue(0);

    if (reducedMotion) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: world.motion.ambientMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: world.motion.ambientMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [drift, reducedMotion, world.motion.ambientMs]);

  const spots = depth === 'front'
    ? frontSpots
    : intensity === 'full'
      ? backSpots
      : backSpots.slice(0, 4);
  const fragmentCount = depth === 'front'
    ? 2
    : intensity === 'full'
      ? 5
      : 3;

  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-world.motion.floatDistance, world.motion.floatDistance],
  });
  const translateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-world.motion.floatDistance * 0.35, world.motion.floatDistance * 0.35],
  });
  const rotate = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [
      `-${world.motion.rotateDegrees}deg`,
      `${world.motion.rotateDegrees}deg`,
    ],
  });

  const colors = [
    world.colors.pattern,
    world.colors.primary,
    world.colors.accent,
  ];

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        styles.layer,
        depth === 'front' ? styles.front : styles.back,
      ]}
    >
      {spots.map((spot, index) => (
        <Animated.Text
          key={`static-${index}`}
          style={[
            styles.fragment,
            spot,
            {
              color: colors[index % colors.length],
              opacity: depth === 'front'
                ? (celebrate ? 0.22 : 0.1)
                : (celebrate ? 0.36 : intensity === 'full' ? 0.2 : 0.12),
              fontSize: depth === 'front' ? 31 : 27,
              transform: [
                {
                  translateY:
                    index % 2 === 0
                      ? translateY
                      : Animated.multiply(translateY, -1),
                },
                {
                  translateX:
                    index % 2 === 0
                      ? translateX
                      : Animated.multiply(translateX, -1),
                },
                { rotate },
                { scale: spot.scale * (celebrate ? 1.16 : 1) },
              ],
            },
          ]}
        >
          {world.background.fragments[index % world.background.fragments.length]}
        </Animated.Text>
      ))}

      {!reducedMotion
        && fallingSeeds.slice(0, fragmentCount).map((seed, index) => (
          <FallingFragment
            key={`fall-${index}`}
            glyph={world.background.falling[index % world.background.falling.length]}
            color={colors[(index + 1) % colors.length]}
            height={height}
            left={seed.left}
            delay={seed.delay}
            duration={
              Math.max(6200, world.motion.ambientMs * (depth === 'front' ? 0.9 : 1.2))
              + index * 540
            }
            drift={seed.drift}
            scale={seed.scale}
            opacity={
              depth === 'front'
                ? (celebrate ? 0.2 : 0.09)
                : (celebrate ? 0.3 : intensity === 'full' ? 0.17 : 0.1)
            }
            front={depth === 'front'}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    overflow: 'hidden',
  },
  back: {
    zIndex: 0,
  },
  front: {
    zIndex: 20,
  },
  fragment: {
    position: 'absolute',
    fontWeight: '900',
  },
  falling: {
    position: 'absolute',
    top: 0,
    fontWeight: '900',
  },
});
