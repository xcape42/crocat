import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { crocatWorld } from '@/src/theme/worlds';

type Props = {
  intensity?: 'quiet' | 'full';
  celebrate?: boolean;
};

const spots = [
  { top: '7%', left: '9%', scale: 0.8 },
  { top: '18%', right: '8%', scale: 1.15 },
  { top: '46%', left: '4%', scale: 0.7 },
  { bottom: '17%', right: '7%', scale: 0.9 },
  { bottom: '5%', left: '18%', scale: 1.05 },
] as const;

export function DecorationLayer({
  intensity = 'quiet',
  celebrate = false,
}: Props) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const reducedMotion = useReducedMotion();
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
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: world.motion.ambientMs,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [drift, reducedMotion, world.motion.ambientMs]);

  const visible = intensity === 'full' ? spots : spots.slice(0, 3);
  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-world.motion.floatDistance, world.motion.floatDistance],
  });
  const rotate = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [
      `-${world.motion.rotateDegrees}deg`,
      `${world.motion.rotateDegrees}deg`,
    ],
  });

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {visible.map((spot, index) => (
        <Animated.Text
          key={index}
          style={[
            styles.fragment,
            spot,
            {
              color: world.colors.pattern,
              opacity: celebrate ? 0.42 : (intensity === 'full' ? 0.27 : 0.16),
              transform: [
                { translateY: index % 2 === 0 ? translateY : Animated.multiply(translateY, -1) },
                { rotate },
                { scale: spot.scale * (celebrate ? 1.22 : 1) },
              ],
            },
          ]}
        >
          {world.background.glyphs[index % world.background.glyphs.length]}
        </Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fragment: {
    position: 'absolute',
    fontSize: 24,
    fontWeight: '900',
  },
});
