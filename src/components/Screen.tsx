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
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { crocatUiTheme } from '@/src/theme/profileTheme';
import { spacing } from '@/src/theme/tokens';

type Props = PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  backLabel?: string;
  onBack?: () => void;
  showBack?: boolean;
}>;

export function Screen({
  children,
  contentStyle,
  scroll = true,
  backLabel = 'BACK',
  onBack,
  showBack,
}: Props) {
  const { height, width } = useWindowDimensions();
  const compact = width < 480 || height < 720;
  const pathname = usePathname();
  const router = useRouter();
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const theme = crocatUiTheme(themeKey);
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
        { backgroundColor: theme.background },
        Platform.OS === 'web' && ({ userSelect: 'none' } as ViewStyle),
      ]}
    >
      <View pointerEvents="none" style={styles.pattern}>
        <Text style={[styles.patternOne, { color: theme.pattern }]}>
          {theme.patternGlyph} {theme.patternAlt} {theme.patternGlyph}
        </Text>
        <Text style={[styles.patternTwo, { color: theme.pattern }]}>
          {theme.patternAlt} {theme.patternGlyph}
        </Text>
        <Text style={[styles.patternThree, { color: theme.pattern }]}>
          {theme.patternGlyph} {theme.patternGlyph} {theme.patternAlt}
        </Text>
      </View>

      {shouldShowBack && (
        <View style={[styles.backBar, { paddingHorizontal: horizontalPadding }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={10}
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}
          >
            <Text style={[styles.backText, { color: theme.muted }]}>← {backLabel}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  pattern: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.18,
  },
  patternOne: {
    position: 'absolute',
    right: 20,
    top: 24,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 7,
    transform: [{ rotate: '-7deg' }],
  },
  patternTwo: {
    position: 'absolute',
    left: 18,
    top: '47%',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 8,
    transform: [{ rotate: '9deg' }],
  },
  patternThree: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 6,
    transform: [{ rotate: '5deg' }],
  },
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
  scroll: { flex: 1 },
  inner: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  scrollContent: { flexGrow: 1 },
  fixedContent: { flex: 1 },
});
