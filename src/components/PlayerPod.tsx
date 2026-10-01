import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Mascot } from '@/src/components/Mascot';
import { ProfileAvatar } from '@/src/components/ProfileAvatar';
import type { ProfileVisual } from '@/src/features/profile/types';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';
import { motion } from '@/src/theme/motion';
import { crocatWorld } from '@/src/theme/worlds';

type Props = {
  profile: ProfileVisual;
  online?: boolean;
  ready?: boolean;
  role?: string | null;
  current?: boolean;
  action?: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
};

export function PlayerPod({
  profile,
  online = true,
  ready = false,
  role,
  current = false,
  action,
  footer,
  compact = false,
}: Props) {
  const world = crocatWorld(profile.themeKey);
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(reducedMotion ? 1 : 0.9)).current;

  useEffect(() => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }

    Animated.spring(scale, {
      toValue: 1,
      friction: motion.spring.friction,
      tension: motion.spring.tension,
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, scale]);

  useEffect(() => {
    if (!ready || reducedMotion) return;
    scale.setValue(0.96);
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [ready, reducedMotion, scale]);

  return (
    <Animated.View
      style={[
        styles.pod,
        compact && styles.podCompact,
        {
          borderColor: current ? world.colors.accent : world.colors.line,
          backgroundColor: world.colors.surface,
          transform: [{ scale }],
        },
      ]}
    >
      <View style={styles.identity}>
        <ProfileAvatar profile={profile} size={compact ? 40 : 54} />
        <Mascot
          themeKey={profile.themeKey}
          state={!online ? 'sleeping' : ready ? 'proud' : 'idle'}
          size={compact ? 38 : 50}
        />
      </View>

      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, { color: world.colors.text }]}>
          {profile.displayName}{current ? ' · YOU' : ''}
        </Text>
        <Text style={[styles.world, { color: world.colors.muted }]}>
          {world.label}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.status, { color: online ? world.colors.text : world.colors.muted }]}>
            {online ? '● ONLINE' : '○ AWAY'}
          </Text>
          <Text style={[styles.ready, { color: ready ? world.colors.accent : world.colors.muted }]}>
            {ready ? 'READY ✓' : 'NOT READY'}
          </Text>
        </View>
      </View>

      {!!footer && <View style={styles.footer}>{footer}</View>}
      {!!action && <View style={styles.action}>{action}</View>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pod: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 0,
    minHeight: 108,
    padding: 12,
    gap: 10,
    borderWidth: 2,
    borderRadius: 28,
  },
  podCompact: {
    flexBasis: 0,
    minHeight: 130,
    padding: 9,
  },
  identity: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 6,
  },
  copy: { minWidth: 0 },
  name: {
    fontSize: 15,
    fontWeight: '900',
  },
  world: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  metaRow: {
    marginTop: 7,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  status: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  role: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  ready: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  footer: { marginTop: 2 },
  action: {
    position: 'absolute',
    right: 9,
    top: 9,
  },
});
