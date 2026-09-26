import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { DrawingPreview } from '@/src/components/DrawingPreview';
import { Screen } from '@/src/components/Screen';
import { loadSubmissions } from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRound } from '@/src/features/multiplayer/realtime';
import type { OnlineSubmission } from '@/src/features/multiplayer/types';
import { colors } from '@/src/theme/tokens';

export default function OnlineRevealScreen() {
  const router = useRouter();
  const { roundId } = useLocalSearchParams<{ roomId: string; roundId: string }>();
  const [submissions, setSubmissions] = useState<OnlineSubmission[]>([]);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!roundId) return;
    try {
      setError('');
      setSubmissions(await loadSubmissions(roundId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the reveal.');
    }
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    let channel: RealtimeChannel | null = subscribeToRound(roundId, refresh);
    void refresh();
    return () => { void removeChannel(channel); channel = null; };
  }, [refresh, roundId]);

  const head = useMemo(() => submissions.find((item) => item.role === 'HEAD')?.drawing ?? null, [submissions]);
  const body = useMemo(() => submissions.find((item) => item.role === 'BODY')?.drawing ?? null, [submissions]);
  const ready = Boolean(head && body);

  return (
    <Screen contentStyle={styles.screen}>
      <View>
        <Text style={styles.kicker}>ONLINE REVEAL</Text>
        <Text style={styles.title}>{ready ? 'Meet your Crocat.' : 'Almost there…'}</Text>
        <Text style={styles.copy}>
          {ready
            ? 'Both halves arrived independently and are now combined on both devices.'
            : 'Waiting for both submissions to reach the room.'}
        </Text>
      </View>

      {ready ? (
        <DrawingPreview head={head} body={body} />
      ) : (
        <View style={styles.wait}><ActivityIndicator color={colors.ink} /><Text style={styles.waitText}>Synchronizing the creature…</Text></View>
      )}

      <CrocatButton disabled={!ready} onPress={() => router.replace('/')}>FINISH ROUND</CrocatButton>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.5, fontSize: 11 },
  title: { marginTop: 6, fontSize: 38, fontWeight: '900', letterSpacing: -1.4, color: colors.ink },
  copy: { marginTop: 7, color: colors.muted, lineHeight: 21 },
  wait: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12 },
  waitText: { color: colors.muted, fontWeight: '700' },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700' },
});
