import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'coral';
  disabled?: boolean;
  style?: ViewStyle;
}>;

export function CrocatButton({ children, onPress, variant = 'primary', disabled, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, variant === 'ghost' && styles.ghostLabel]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 58,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.ink,
  },
  primary: { backgroundColor: colors.lime },
  secondary: { backgroundColor: colors.card },
  ghost: { backgroundColor: 'transparent', borderColor: colors.line },
  coral: { backgroundColor: colors.coral },
  label: { color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: 0.4 },
  ghostLabel: { color: colors.muted },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.88 },
  disabled: { opacity: 0.4 },
});
