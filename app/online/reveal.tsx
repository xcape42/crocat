import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import { loadSubmissions } from '@/src/features/multiplayer/room';
import { colors } from '@/src/theme/tokens';
import type { CrocatDrawing } from '@/src/types/game';

export default function OnlineRevealScreen() {
  const router = useRouter();
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
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.copy}>{error || 'Combining both halves…'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View>
        <Text style={styles.kicker}>BOTH PLAYERS ARE IN</Text>
        <Text style={styles.title}>{revealed ? 'A beautiful accident.' : 'Ready to meet it?'}</Text>
        <Text style={styles.copy}>
          {revealed
            ? 'Crocat 1.1.0 has synchronized this drawing across two devices.'
            : 'The reveal happens locally now because both submissions are already locked in.'}
        </Text>
      </View>

      <View style={[styles.preview, !revealed && styles.hidden]}>
        {revealed
          ? <DrawingPreview head={head} body={body} />
          : <View style={styles.curtain}><Text style={styles.eyes}>◉   ◉</Text></View>}
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
  screen: { gap: 14 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.4, fontSize: 11 },
  title: { marginTop: 6, fontSize: 38, lineHeight: 41, fontWeight: '900', color: colors.ink, letterSpacing: -1.3 },
  copy: { marginTop: 8, color: colors.muted, fontSize: 15, lineHeight: 21 },
  preview: { flex: 1, minHeight: 520 },
  hidden: { borderRadius: 28, overflow: 'hidden' },
  curtain: { flex: 1, minHeight: 520, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  eyes: { color: colors.white, fontSize: 54, fontWeight: '900' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
