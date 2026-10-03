import type { PropsWithChildren } from 'react';
import { usePathname, useRouter } from 'expo-router';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DecorationLayer } from '@/src/components/DecorationLayer';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { spacing } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';

type Props = PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  backLabel?: string;
  onBack?: () => void;
  showBack?: boolean;
  decorations?: 'none' | 'quiet' | 'full';
  celebrate?: boolean;
}>;

export function Screen({
  children,
  contentStyle,
  scroll = true,
  backLabel = 'BACK',
  onBack,
  showBack,
  decorations = 'quiet',
  celebrate = false,
}: Props) {
  const { height, width } = useWindowDimensions();
  const compact = width < 480 || height < 720;
  const pathname = usePathname();
  const router = useRouter();
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const world = crocatWorld(themeKey);
  const horizontalPadding = compact ? 14 : spacing.lg;
  const paddingStyle = compact
    ? { paddingHorizontal: 14, paddingVertical: 12 }
    : { padding: spacing.lg };
  const shouldShowBack = showBack ?? pathname !== '/';

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  return (
    <SafeAreaView
      style={[
        styles.safe,
        { backgroundColor: world.colors.background },
        Platform.OS === 'web' && ({ userSelect: 'none' } as ViewStyle),
      ]}
    >
      {decorations !== 'none' && (
        <DecorationLayer
          intensity={decorations}
          celebrate={celebrate}
          depth="back"
        />
      )}

      {shouldShowBack && (
        <View style={[styles.backBar, { paddingHorizontal: horizontalPadding }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={10}
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}
          >
            <Text style={[styles.backText, { color: world.colors.muted }]}>← {backLabel}</Text>
          </Pressable>
        </View>
      )}

      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.inner,
            styles.scrollContent,
            paddingStyle,
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.inner, styles.fixedContent, paddingStyle, contentStyle]}>
          {children}
        </View>
      )}

      {decorations !== 'none' && (
        <DecorationLayer
          intensity={decorations}
          celebrate={celebrate}
          depth="front"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  backBar: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    paddingTop: 8,
    zIndex: 2,
  },
  backButton: {
    minHeight: 28,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  backPressed: { opacity: 0.55 },
  scroll: { flex: 1, zIndex: 1 },
  inner: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  scrollContent: { flexGrow: 1 },
  fixedContent: { flex: 1, zIndex: 1 },
});
