import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { colors, radius, spacing } from '@/src/theme/tokens';
import { ensureCurrentProfile } from '@/src/features/profile/api';
import { createRoom, joinOrCreateRoom, loadRoomById } from '@/src/features/multiplayer/room';
import { loadLastRoomCode, rememberRoomCode } from '@/src/features/multiplayer/recentRoom';
import { hasSupabaseConfig } from '@/src/lib/supabase';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';

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

  const prepare = async () => {
    if (!hasSupabaseConfig) throw new Error('Supabase is not configured yet.');
    const identity = await ensureCurrentProfile();
    setDisplayName(identity.profile.display_name);
    return identity;
  };

  const create = async () => {
    try {
      setError('');
      setBusy('create');
      const { user, profile } = await prepare();
      const ticket = await createRoom(profile.display_name, 180);
      await rememberRoomCode(ticket.code);
      setDisplayName(profile.display_name);
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
      const { user, profile } = await prepare();
      if (code.trim().length !== 6) throw new Error('Enter the 6-character room code.');
      const ticket = await joinOrCreateRoom(
        code,
        profile.display_name,
        profile.display_name,
        180,
      );
      const roomState = await loadRoomById(ticket.roomId);
      const me = roomState.players.find((player) => player.user_id === user.id);
      if (!me) throw new Error('Room membership could not be established.');
      await rememberRoomCode(ticket.code);
      setDisplayName(me.display_name);
      setIdentity(user.id, ticket.role);
      router.replace(`/online/room/${ticket.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join room.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen backLabel="PLAY">
      <View style={styles.header}>
        <Text style={styles.kicker}>CROCAT ONLINE · 1.6.5</Text>
        <Text style={styles.title}>Draw apart. Reveal together.</Text>
        <Text style={styles.copy}>Your Crocat profile follows you into every room. Entering a code joins that room; if it does not exist yet, Crocat creates it. HEAD and BODY are randomized every round.</Text>
      </View>

      {!hasSupabaseConfig && (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Backend connection missing</Text>
          <Text style={styles.warningText}>Crocat online needs the configured Supabase project. Local Split still works without it.</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>CREATE ONLINE ROOM</Text>
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
