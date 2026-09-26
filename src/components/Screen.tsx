import type { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/src/theme/tokens';

type Props = PropsWithChildren<{ contentStyle?: ViewStyle }>;

export function Screen({ children, contentStyle }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1, padding: spacing.lg, width: '100%', maxWidth: 900, alignSelf: 'center' },
});
