import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { crocatWorld } from '@/src/theme/worlds';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  variant?: 'card' | 'surface' | 'accent';
  organic?: boolean;
}>;

export function CrocatCard({
  children,
  style,
  variant = 'card',
  organic,
}: Props) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const organicShape = organic ?? world.shapes.organicCards;

  const backgroundColor =
    variant === 'accent'
      ? world.colors.secondary
      : variant === 'surface'
        ? world.colors.surface
        : world.colors.card;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor: world.colors.line,
          borderWidth: world.shapes.borderWidth,
          borderRadius: world.shapes.cardRadius,
        },
        organicShape && {
          borderTopLeftRadius: world.shapes.cardRadius + 8,
          borderTopRightRadius: Math.max(16, world.shapes.cardRadius - 6),
          borderBottomLeftRadius: Math.max(16, world.shapes.cardRadius - 3),
          borderBottomRightRadius: world.shapes.cardRadius + 5,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
