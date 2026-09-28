import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { ProfileThemeKey } from '@/src/features/profile/types';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { motion } from '@/src/theme/motion';
import { crocatWorld, type MascotState } from '@/src/theme/worlds';

type Props = {
  themeKey?: ProfileThemeKey;
  state?: MascotState;
  size?: number;
  animated?: boolean;
  accessibilityLabel?: string;
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

  useEffect(() => {
    scale.stopAnimation();
    lift.stopAnimation();

    if (!animated || reducedMotion) {
      scale.setValue(1);
      lift.setValue(0);
      return;
    }

    scale.setValue(state === 'celebrate' ? 0.84 : 0.93);
    lift.setValue(state === 'happy' || state === 'celebrate' ? 8 : 3);

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

  const faceSize = Math.max(11, Math.round(size * 0.18));
  const accessorySize = Math.max(12, Math.round(size * 0.23));

  return (
    <Animated.View
      accessible
      accessibilityLabel={accessibilityLabel ?? `${world.mascot.name} mascot`}
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          transform: [{ translateY: lift }, { scale }],
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
          style={[
            styles.face,
            { color: world.colors.text, fontSize: faceSize },
          ]}
        >
          {world.mascot.faces[state]}
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
