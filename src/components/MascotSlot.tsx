import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = PropsWithChildren<{
  compact?: boolean;
  align?: 'left' | 'center' | 'right';
}>;

export function MascotSlot({
  children,
  compact = false,
  align = 'center',
}: Props) {
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.slot,
        compact && styles.compact,
        align === 'left' && styles.left,
        align === 'right' && styles.right,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 58,
  },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
});
