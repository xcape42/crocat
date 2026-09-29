import { StyleSheet, Text, View } from 'react-native';
import {
  profileColor,
  profileFace,
  profileSymbol,
} from '@/src/features/profile/options';
import type { ProfileVisual } from '@/src/features/profile/types';
import { crocatWorld } from '@/src/theme/worlds';

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
  const world = crocatWorld(profile.themeKey);
  const faceSize = Math.max(8, Math.round(size * 0.21));
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
          borderColor: world.colors.text,
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
            backgroundColor: world.colors.card,
            borderColor: world.colors.text,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.face,
            {
              color: world.colors.text,
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
              backgroundColor: world.colors.surface,
              borderColor: world.colors.text,
            },
          ]}
        >
          <Text
            style={[
              styles.symbolText,
              { color: world.colors.text, fontSize: symbolSize },
            ]}
          >
            {profileSymbol(profile.symbolKey)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  face: {
    fontWeight: '900',
  },
  symbol: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  symbolText: {
    fontWeight: '900',
  },
});
