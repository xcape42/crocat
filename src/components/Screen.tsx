import type { PropsWithChildren } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}>;

export function Screen({ children, contentStyle, scroll = true }: Props) {
  const { height, width } = useWindowDimensions();
  const compact = width < 480 || height < 720;
  const paddingStyle = compact
    ? { paddingHorizontal: 14, paddingVertical: 12 }
    : { padding: spacing.lg };

  return (
    <SafeAreaView
      style={[
        styles.safe,
        Platform.OS === 'web' && ({ userSelect: 'none' } as ViewStyle),
      ]}
    >
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.inner, styles.scrollContent, paddingStyle, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.inner, styles.fixedContent, paddingStyle, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  inner: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },
  fixedContent: {
    flex: 1,
  },
});
