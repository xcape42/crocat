import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { ensureGuest } from '@/src/features/multiplayer/auth';
import { createRoom, joinOrCreateRoom, loadRoomById } from '@/src/features/multiplayer/room';
import { loadLastRoomCode, rememberActiveRoomCode } from '@/src/features/multiplayer/recentRoom';
import { hasSupabaseConfig } from '@/src/lib/supabase';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';

const HOST_NAME = 'Domi';
const JOINER_NAME = 'Sarah';

export default function OnlineEntryScreen() {
  const router = useRouter();
  const { setDisplayName, setIdentity } = useOnlineGameStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadLastRoomCode().then((savedCode) => {
      if (!cancelled && savedCode) setCode((current) => current || savedCode);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const prepare = async (displayName: string) => {
    if (!hasSupabaseConfig) throw new Error('Supabase is not configured yet.');
    const user = await ensureGuest(displayName);
    setDisplayName(displayName);
    return user;
  };

  const create = async () => {
    try {
      setError('');
      setBusy('create');
      const user = await prepare(HOST_NAME);
      const ticket = await createRoom(HOST_NAME, 180);
      await rememberActiveRoomCode(ticket.code);
      setDisplayName(HOST_NAME);
      setIdentity(user.id, ticket.role);
      router.replace(`/online/room/${ticket.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create room.');
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    try {
      setError('');
      setBusy('join');
      const user = await prepare(JOINER_NAME);
      if (code.trim().length !== 6) throw new Error('Enter the 6-character room code.');
      const ticket = await joinOrCreateRoom(code, HOST_NAME, JOINER_NAME, 180);
      const roomState = await loadRoomById(ticket.roomId);
      const actualName = roomState.room.host_id === user.id ? HOST_NAME : JOINER_NAME;
      await rememberActiveRoomCode(ticket.code);
      setDisplayName(actualName);
      setIdentity(user.id, ticket.role);
      router.replace(`/online/room/${ticket.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join room.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Text style={styles.back} onPress={() => router.back()}>← MODES</Text>
      <View style={styles.header}>
        <Text style={styles.kicker}>CROCAT ONLINE · 1.4.0</Text>
        <Text style={styles.title}>Draw apart. Reveal together.</Text>
        <Text style={styles.copy}>No account and no name form. Entering a code joins that room; if it does not exist yet, Crocat creates it. The two drawing parts are reassigned every round.</Text>
      </View>

      {!hasSupabaseConfig && (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Backend connection missing</Text>
          <Text style={styles.warningText}>Crocat online needs the configured Supabase project. Local Split still works without it.</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>CREATE AS DOMI</Text>
        <CrocatButton disabled={busy !== null || !hasSupabaseConfig} onPress={create}>
          {busy === 'create' ? 'CREATING…' : 'CREATE ROOM'}
        </CrocatButton>
      </View>

      <Text style={styles.or}>OR ENTER A ROOM CODE</Text>

      <View style={styles.card}>
        <Text style={styles.label}>ROOM CODE · JOIN OR CREATE</Text>
        <TextInput
          value={code}
          onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="CROC42"
          placeholderTextColor={colors.muted}
          maxLength={6}
          style={[styles.input, styles.code]}
          autoCapitalize="characters"
        />
        <CrocatButton variant="secondary" disabled={busy !== null || !hasSupabaseConfig} onPress={join}>
          {busy === 'join' ? 'OPENING…' : 'JOIN / CREATE ROOM'}
        </CrocatButton>
      </View>

      {busy && <ActivityIndicator style={{ marginTop: 16 }} color={colors.ink} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  header: { marginTop: spacing.xl, marginBottom: 18 },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.3, fontSize: 11 },
  title: { marginTop: 8, fontSize: 42, lineHeight: 45, fontWeight: '900', letterSpacing: -1.6, color: colors.ink },
  copy: { marginTop: 10, color: colors.muted, lineHeight: 22, fontSize: 16 },
  warning: { backgroundColor: '#F8DFB7', borderRadius: radius.md, padding: 14, marginBottom: 14 },
  warningTitle: { fontWeight: '900', color: colors.ink },
  warningText: { marginTop: 4, color: colors.ink, opacity: 0.7, lineHeight: 19 },
  card: { gap: 10, padding: 16, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  label: { color: colors.muted, fontWeight: '900', letterSpacing: 1.1, fontSize: 11 },
  input: { minHeight: 52, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.md, paddingHorizontal: 14, color: colors.ink, fontSize: 16, backgroundColor: colors.paper },
  code: { fontWeight: '900', letterSpacing: 4, textAlign: 'center', fontSize: 22 },
  or: { marginVertical: 14, textAlign: 'center', color: colors.muted, fontWeight: '900', letterSpacing: 1 },
  error: { marginTop: 14, color: '#A74343', fontWeight: '700', textAlign: 'center' },
});
