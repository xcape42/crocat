import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { ProfileThemeKey } from '@/src/features/profile/types';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { motion } from '@/src/theme/motion';
import {
  crocatWorld,
  type MascotIdleExpression,
  type MascotIdleStyle,
  type MascotState,
} from '@/src/theme/worlds';

type Props = {
  themeKey?: ProfileThemeKey;
  state?: MascotState;
  size?: number;
  animated?: boolean;
  accessibilityLabel?: string;
};

type FaceMoment = 'base' | MascotIdleExpression;

const IDLE_FACE_STATES = new Set<MascotState>([
  'idle',
  'happy',
  'shy',
  'curious',
  'waiting',
  'proud',
]);

const AMBIENT_STATES = new Set<MascotState>([
  'idle',
  'happy',
  'shy',
  'curious',
  'waiting',
  'nervous',
  'excited',
  'proud',
  'celebrate',
]);

const idleMotion: Record<
  MascotIdleStyle,
  { x: number; y: number; rotate: number; breathe: number }
> = {
  sway: { x: 1, y: 0.2, rotate: 0.75, breathe: 0.01 },
  float: { x: 0.35, y: 1, rotate: 0.35, breathe: 0.008 },
  bounce: { x: 0.65, y: 0.6, rotate: 1, breathe: 0.018 },
};

export function Mascot({
  themeKey = 'moss',
  state = 'idle',
  size = 92,
  animated = true,
  accessibilityLabel,
}: Props) {
  const world = crocatWorld(themeKey);
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const ambient = useRef(new Animated.Value(0)).current;
  const [faceMoment, setFaceMoment] = useState<FaceMoment>('base');

  useEffect(() => {
    scale.stopAnimation();
    lift.stopAnimation();

    if (!animated || reducedMotion) {
      scale.setValue(1);
      lift.setValue(0);
      return;
    }

    scale.setValue(state === 'celebrate' || state === 'excited' ? 0.84 : 0.93);
    lift.setValue(
      state === 'happy' || state === 'excited' || state === 'celebrate'
        ? 8
        : 3,
    );

    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: motion.spring.friction,
        tension: motion.spring.tension,
        useNativeDriver: true,
      }),
      Animated.spring(lift, {
        toValue: 0,
        friction: motion.spring.friction,
        tension: motion.spring.tension,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animated, lift, reducedMotion, scale, state]);

  useEffect(() => {
    ambient.stopAnimation();
    ambient.setValue(0);

    if (!animated || reducedMotion || !AMBIENT_STATES.has(state)) return;

    const loop = Animated.loop(
      Animated.timing(ambient, {
        toValue: 1,
        duration: world.motion.ambientMs,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );

    loop.start();

    return () => {
      loop.stop();
      ambient.setValue(0);
    };
  }, [
    ambient,
    animated,
    reducedMotion,
    state,
    world.key,
    world.motion.ambientMs,
  ]);

  useEffect(() => {
    setFaceMoment('base');

    if (!animated || reducedMotion || !IDLE_FACE_STATES.has(state)) return;

    let nextTimer: ReturnType<typeof setTimeout> | undefined;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      const {
        expressionMinMs,
        expressionMaxMs,
        gazeMs,
        sequence,
      } = world.mascot.idle;
      const delay =
        expressionMinMs
        + Math.round(Math.random() * (expressionMaxMs - expressionMinMs));

      nextTimer = setTimeout(() => {
        if (cancelled) return;

        const moment = sequence[Math.floor(Math.random() * sequence.length)] ?? 'blink';
        setFaceMoment(moment);

        resetTimer = setTimeout(() => {
          if (cancelled) return;
          setFaceMoment('base');
          schedule();
        }, moment === 'blink' ? Math.min(180, gazeMs) : gazeMs);
      }, delay);
    };

    schedule();

    return () => {
      cancelled = true;
      if (nextTimer) clearTimeout(nextTimer);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [animated, reducedMotion, state, world.key, world.mascot.idle]);

  const faceSize = Math.max(11, Math.round(size * 0.18));
  const accessorySize = Math.max(12, Math.round(size * 0.23));
  const profile = idleMotion[world.mascot.idle.style];
  const distance = world.motion.floatDistance * 0.55;
  const horizontal = distance * profile.x;
  const vertical = distance * profile.y;
  const rotation = world.motion.rotateDegrees * profile.rotate * 0.5;

  const translateX = ambient.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, horizontal, 0, -horizontal, 0],
  });
  const translateY = ambient.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -vertical, 0, vertical * 0.45, 0],
  });
  const rotate = ambient.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [
      '0deg',
      `${rotation}deg`,
      '0deg',
      `${-rotation}deg`,
      '0deg',
    ],
  });
  const breathe = ambient.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [
      1,
      1 - profile.breathe,
      1,
      1 + profile.breathe,
      1,
    ],
  });

  const face =
    faceMoment === 'base'
      ? world.mascot.faces[state]
      : world.mascot.idle.expressions[faceMoment];

  return (
    <Animated.View
      accessible
      pointerEvents="none"
      accessibilityLabel={
        accessibilityLabel
        ?? `${world.mascot.name} mascot · ${world.mascot.personality}`
      }
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          transform: [
            { translateY: lift },
            { translateX },
            { translateY },
            { rotate },
            { scale },
            { scaleY: breathe },
          ],
        },
      ]}
    >
      <View
        style={[
          styles.body,
          {
            width: size,
            height: size * 0.82,
            marginTop: size * 0.12,
            borderRadius: size * 0.38,
            backgroundColor: world.mascot.fill,
            borderColor: world.colors.text,
            borderWidth: world.shapes.borderWidth,
          },
          world.shapes.organicCards && {
            borderTopLeftRadius: size * 0.46,
            borderTopRightRadius: size * 0.32,
            borderBottomLeftRadius: size * 0.34,
            borderBottomRightRadius: size * 0.45,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.face,
            { color: world.colors.text, fontSize: faceSize },
          ]}
        >
          {face}
        </Text>
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.accessory,
          {
            width: size * 0.34,
            height: size * 0.34,
            borderRadius: size,
            backgroundColor: world.mascot.secondary,
            borderColor: world.colors.text,
          },
        ]}
      >
        <Text
          style={[
            styles.accessoryText,
            { color: world.colors.text, fontSize: accessorySize },
          ]}
        >
          {world.mascot.accessory}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  accessory: {
    position: 'absolute',
    right: -2,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  accessoryText: {
    fontWeight: '900',
  },
});
