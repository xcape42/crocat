import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { ensureCurrentProfile } from '@/src/features/profile/api';
import { openOrCreateRoom } from '@/src/features/multiplayer/room';
import { rememberRoomCode } from '@/src/features/multiplayer/recentRoom';
import { hasSupabaseConfig } from '@/src/lib/supabase';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors, radius } from '@/src/theme/tokens';

export default function OnlineEntryScreen() {
  const router = useRouter();
  const { setDisplayName, setIdentity } = useOnlineGameStore();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setError('');
        if (!hasSupabaseConfig) {
          throw new Error('Supabase is not configured yet.');
        }

        const { user, profile } = await ensureCurrentProfile();
        const ticket = await openOrCreateRoom(profile.display_name, 180);
        if (cancelled) return;

        await rememberRoomCode(ticket.code);
        setDisplayName(profile.display_name);
        setIdentity(user.id, ticket.role);
        router.replace('/online/room/' + ticket.code);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not open online lobby.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, router, setDisplayName, setIdentity]);

  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.replace('/play')}>← PLAY</Text>

      <View style={styles.center}>
        {!error ? (
          <>
            <View style={styles.face}>
              <Text style={styles.faceText}>◉ ᴗ ◉</Text>
            </View>
            <ActivityIndicator color={colors.ink} />
            <Text style={styles.title}>Opening your lobby…</Text>
            <Text style={styles.copy}>Reusing your current room when possible.</Text>
          </>
        ) : (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Couldn’t open the lobby.</Text>
            <Text style={styles.error}>{error}</Text>
            <CrocatButton onPress={() => setAttempt((value) => value + 1)}>
              TRY AGAIN
            </CrocatButton>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  center: {
    flex: 1,
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  face: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.moss,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  faceText: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  title: { color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  copy: { color: colors.muted, fontSize: 12 },
  errorCard: {
    width: '100%',
    maxWidth: 430,
    gap: 12,
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  errorTitle: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  error: { color: '#A74343', lineHeight: 20, fontWeight: '700' },
});
