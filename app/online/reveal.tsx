import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { GameSurfaceSlot } from '@/src/components/GameSurfaceSlot';
import { Screen } from '@/src/components/Screen';
import { loadSubmissions } from '@/src/features/multiplayer/room';
import { PREVIEW_SURFACE_ASPECT } from '@/src/theme/gameSurface';
import { colors, radius } from '@/src/theme/tokens';
import type { CrocatDrawing } from '@/src/types/game';

export default function OnlineRevealScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const { roundId } = useLocalSearchParams<{ roundId: string; roomId: string }>();
  const [head, setHead] = useState<CrocatDrawing | null>(null);
  const [body, setBody] = useState<CrocatDrawing | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (!roundId) throw new Error('Round is missing.');
        const submissions = await loadSubmissions(roundId);
        setHead(submissions.find((item) => item.role === 'HEAD')?.drawing ?? null);
        setBody(submissions.find((item) => item.role === 'BODY')?.drawing ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the reveal.');
      }
    })();
  }, [roundId]);

  if (!head || !body) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.copy}>{error || 'Combining both halves…'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={[styles.screen, compact && styles.screenCompact]}>
      <View style={styles.header}>
        <Text style={styles.kicker}>BOTH PLAYERS ARE IN</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>
          {revealed ? 'A beautiful accident.' : 'Ready to meet it?'}
        </Text>
        <Text style={[styles.copy, compact && styles.copyCompact]}>
          {revealed
            ? 'Both halves are synchronized across the room.'
            : 'Both submissions are locked in. Reveal when you are ready.'}
        </Text>
      </View>

      <View style={styles.previewArea}>
        {revealed ? (
          <DrawingPreview head={head} body={body} />
        ) : (
          <GameSurfaceSlot kind="preview" aspectRatio={PREVIEW_SURFACE_ASPECT} maxWidth={360}>
            {({ width, height: frameHeight }) => (
              <View style={[styles.curtain, { width, height: frameHeight }]}>
                <Text style={styles.eyes}>◉   ◉</Text>
              </View>
            )}
          </GameSurfaceSlot>
        )}
      </View>

      {!revealed ? (
        <CrocatButton variant="coral" onPress={() => setRevealed(true)}>REVEAL CROCAT</CrocatButton>
      ) : (
        <CrocatButton onPress={() => router.replace('/online')}>BACK TO ONLINE</CrocatButton>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 10 },
  screenCompact: { gap: 7 },
  header: { flexShrink: 0 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.4, fontSize: 11 },
  title: { marginTop: 6, fontSize: 34, lineHeight: 38, fontWeight: '900', color: colors.ink, letterSpacing: -1.3 },
  titleCompact: { fontSize: 28, lineHeight: 31 },
  copy: { marginTop: 7, color: colors.muted, fontSize: 14, lineHeight: 19 },
  copyCompact: { fontSize: 12, lineHeight: 16 },
  previewArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  curtain: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyes: { color: colors.white, fontSize: 48, fontWeight: '900' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
