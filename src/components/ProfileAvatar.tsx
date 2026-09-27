import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme/tokens';
import {
  profileColor,
  profileFace,
  profileSymbol,
} from '@/src/features/profile/options';
import type { ProfileVisual } from '@/src/features/profile/types';

type Props = {
  profile: ProfileVisual;
  size?: number;
  showSymbol?: boolean;
};

export function ProfileAvatar({
  profile,
  size = 64,
  showSymbol = false,
}: Props) {
  const dark = profile.themeKey === 'ink';
  const faceSize = Math.max(11, Math.round(size * 0.21));
  const symbolSize = Math.max(10, Math.round(size * 0.22));

  return (
    <View
      accessibilityLabel={profile.displayName + ' profile avatar'}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: profile.avatarKey === 'round' ? size / 2 : Math.round(size * 0.3),
          backgroundColor: profileColor(profile.colorKey),
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: profile.avatarKey === 'round' ? size : Math.round(size * 0.22),
            backgroundColor: dark ? colors.ink : colors.card,
          },
        ]}
      >
        <Text
          style={[
            styles.face,
            {
              color: dark ? colors.paper : colors.ink,
              fontSize: faceSize,
            },
          ]}
        >
          {profileFace(profile.avatarKey)}
        </Text>
      </View>

      {showSymbol && (
        <View
          style={[
            styles.symbol,
            {
              width: size * 0.34,
              height: size * 0.34,
              borderRadius: size,
              right: -size * 0.03,
              bottom: -size * 0.03,
            },
          ]}
        >
          <Text style={[styles.symbolText, { fontSize: symbolSize }]}>
            {profileSymbol(profile.symbolKey)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.ink,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.ink,
  },
  face: {
    fontWeight: '900',
  },
  symbol: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  symbolText: {
    color: colors.ink,
    fontWeight: '900',
  },
});
