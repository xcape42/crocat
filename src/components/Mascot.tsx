import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type {
  MascotCharacterKey,
  MascotShapeKey,
  ProfileColorKey,
  ProfileSymbolKey,
  ProfileThemeKey,
} from '@/src/features/profile/types';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import {
  legacyMascotCharacterForTheme,
  mascotCharacter,
  mascotColor,
  mascotSymbol,
  type MascotIdleExpression,
  type MascotIdleStyle,
  type MascotState,
} from '@/src/theme/mascots';
import { motion } from '@/src/theme/motion';
import { crocatPalette } from '@/src/theme/palette';

type MascotProfile = {
  displayName?: string;
  colorKey?: ProfileColorKey;
  avatarKey?: MascotShapeKey;
  mascotCharacterKey?: MascotCharacterKey;
  symbolKey?: ProfileSymbolKey;
  themeKey?: ProfileThemeKey;
};

type Props = {
  profile?: MascotProfile;
  state?: MascotState;
  size?: number;
  animated?: boolean;
  accessibilityLabel?: string;
};

type FaceMoment = 'base' | MascotIdleExpression;

const BLINK_FACE = '− ᴗ −';

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

function shapeRadii(shape: MascotShapeKey, size: number) {
  if (shape === 'ears') {
    return {
      borderTopLeftRadius: size * 0.46,
      borderTopRightRadius: size * 0.32,
      borderBottomLeftRadius: size * 0.36,
      borderBottomRightRadius: size * 0.44,
    };
  }

  if (shape === 'spiky') {
    return {
      borderTopLeftRadius: size * 0.29,
      borderTopRightRadius: size * 0.46,
      borderBottomLeftRadius: size * 0.43,
      borderBottomRightRadius: size * 0.3,
    };
  }

  return {
    borderTopLeftRadius: size * 0.39,
    borderTopRightRadius: size * 0.39,
    borderBottomLeftRadius: size * 0.39,
    borderBottomRightRadius: size * 0.39,
  };
}

export function Mascot({
  profile,
  state = 'idle',
  size = 92,
  animated = true,
  accessibilityLabel,
}: Props) {
  const reducedMotion = useReducedMotion();
  const characterKey =
    profile?.mascotCharacterKey
    ?? legacyMascotCharacterForTheme(profile?.themeKey);
  const character = mascotCharacter(characterKey);
  const shape = profile?.avatarKey ?? 'round';
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const ambient = useRef(new Animated.Value(0)).current;
  const faceShift = useRef(new Animated.Value(0)).current;
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
        duration: character.motion.ambientMs,
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
    character.key,
    character.motion.ambientMs,
    reducedMotion,
    state,
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
      } = character.idle;
      const delay =
        expressionMinMs
        + Math.round(Math.random() * (expressionMaxMs - expressionMinMs));

      nextTimer = setTimeout(() => {
        if (cancelled) return;

        const moments =
          state === 'idle'
            ? sequence
            : sequence.filter((moment) => moment !== 'blink');
        const moment =
          moments[Math.floor(Math.random() * moments.length)] ?? 'left';
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
  }, [animated, character.idle, character.key, reducedMotion, state]);

  useEffect(() => {
    faceShift.stopAnimation();

    if (!animated || reducedMotion) {
      faceShift.setValue(0);
      return;
    }

    const gazeDistance = Math.max(1.5, size * 0.035);
    const target =
      faceMoment === 'left'
        ? -gazeDistance
        : faceMoment === 'right'
          ? gazeDistance
          : 0;

    Animated.timing(faceShift, {
      toValue: target,
      duration: motion.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    return () => {
      faceShift.stopAnimation();
    };
  }, [animated, faceMoment, faceShift, reducedMotion, size]);

  const faceSize = Math.max(9, Math.round(size * 0.18));
  const accessorySize = Math.max(10, Math.round(size * 0.22));
  const idleProfile = idleMotion[character.idle.style];
  const distance = character.motion.floatDistance * 0.55;
  const horizontal = distance * idleProfile.x;
  const vertical = distance * idleProfile.y;
  const rotation = character.motion.rotateDegrees * idleProfile.rotate * 0.5;

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
      1 - idleProfile.breathe,
      1,
      1 + idleProfile.breathe,
      1,
    ],
  });

  const face =
    state === 'idle' && faceMoment === 'blink'
      ? BLINK_FACE
      : character.faces[state];

  return (
    <Animated.View
      accessible
      pointerEvents="none"
      accessibilityLabel={
        accessibilityLabel
        ?? `${profile?.displayName ?? 'Crocat'} mascot · ${character.label.toLowerCase()}`
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
            backgroundColor: mascotColor(profile?.colorKey),
            borderColor: crocatPalette.ink,
            ...shapeRadii(shape, size),
          },
        ]}
      >
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.face,
            {
              color: crocatPalette.ink,
              fontSize: faceSize,
              transform: [{ translateX: faceShift }],
            },
          ]}
        >
          {face}
        </Animated.Text>
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.accessory,
          {
            width: size * 0.34,
            height: size * 0.34,
            borderRadius: size,
            backgroundColor: crocatPalette.cream,
            borderColor: crocatPalette.ink,
          },
        ]}
      >
        <Text
          style={[
            styles.accessoryText,
            { color: crocatPalette.ink, fontSize: accessorySize },
          ]}
        >
          {mascotSymbol(profile?.symbolKey)}
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
    borderWidth: 2,
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
