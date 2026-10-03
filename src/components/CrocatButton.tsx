import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { readableTextColor } from '@/src/theme/contrast';
import { crocatWorld } from '@/src/theme/worlds';

type Props = PropsWithChildren<{
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'coral';
  disabled?: boolean;
  style?: ViewStyle;
}>;

export function CrocatButton({
  children,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: Props) {
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const backgroundColor =
    variant === 'primary'
      ? world.colors.primary
      : variant === 'coral'
        ? world.colors.accent
        : variant === 'secondary'
          ? world.colors.surface
          : 'transparent';
  const borderColor = variant === 'ghost' ? world.colors.line : world.colors.text;
  const labelColor = variant === 'ghost'
    ? world.colors.muted
    : readableTextColor(backgroundColor);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderColor,
          borderRadius: world.shapes.buttonRadius,
          borderWidth: world.shapes.borderWidth,
        },
        world.shapes.organicCards && variant !== 'ghost' && {
          borderTopRightRadius: Math.max(18, world.shapes.buttonRadius - 6),
          borderBottomLeftRadius: Math.max(18, world.shapes.buttonRadius - 4),
        },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: labelColor },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 58,
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pressed: { transform: [{ scale: 0.975 }], opacity: 0.9 },
  disabled: { opacity: 0.4 },
});
