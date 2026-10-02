import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { CrocatButton } from '@/src/components/CrocatButton';
import { CrocatCard } from '@/src/components/CrocatCard';
import { Mascot } from '@/src/components/Mascot';
import { Screen } from '@/src/components/Screen';
import { ensureCurrentProfile } from '@/src/features/profile/api';
import type { PlayerProfile } from '@/src/features/profile/types';
import { createRoom, joinOrCreateRoom, loadRoomById } from '@/src/features/multiplayer/room';
import { loadLastRoomCode, rememberRoomCode } from '@/src/features/multiplayer/recentRoom';
import { hasSupabaseConfig } from '@/src/lib/supabase';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { radius, spacing } from '@/src/theme/tokens';
import { crocatWorld } from '@/src/theme/worlds';

export default function OnlineEntryScreen() {
  const router = useRouter();
  const { setDisplayName, setIdentity } = useOnlineGameStore();
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');
  const world = crocatWorld(themeKey);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      loadLastRoomCode(),
      ensureCurrentProfile(),
    ]).then(([savedCode, identity]) => {
      if (cancelled) return;
      if (savedCode) setCode((current) => current || savedCode);
      setProfile(identity.profile);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const prepare = async () => {
    if (!hasSupabaseConfig) throw new Error('Supabase is not configured yet.');
    const identity = await ensureCurrentProfile();
    setProfile(identity.profile);
    setDisplayName(identity.profile.display_name);
    return identity;
  };

  const create = async () => {
    try {
      setError('');
      setBusy('create');
      const { user, profile: currentProfile } = await prepare();
      const ticket = await createRoom(currentProfile.display_name, 180);
      await rememberRoomCode(ticket.code);
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
      const { user, profile: currentProfile } = await prepare();
      if (code.trim().length !== 6) throw new Error('Enter the 6-character room code.');
      const ticket = await joinOrCreateRoom(
        code,
        currentProfile.display_name,
        currentProfile.display_name,
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
    <Screen backLabel="PLAY" decorations="full">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.kicker, { color: world.colors.accent }]}>CROCAT ONLINE · 1.7.4</Text>
          <Text style={[styles.title, { color: world.colors.text }]}>Bring your little world.</Text>
          <Text style={[styles.copy, { color: world.colors.muted }]}>
            Create a room or enter a code. When another player arrives, both worlds meet in the lobby.
          </Text>
        </View>
        <Mascot
          state={busy ? 'happy' : 'idle'}
          size={88}
        />
      </View>

      {!hasSupabaseConfig && (
        <CrocatCard variant="accent" style={styles.warning}>
          <Text style={[styles.warningTitle, { color: world.colors.text }]}>Backend connection missing</Text>
          <Text style={[styles.warningText, { color: world.colors.muted }]}>
            Crocat online needs the configured Supabase project. Local Split still works without it.
          </Text>
        </CrocatCard>
      )}

      <CrocatCard style={styles.card}>
        <Text style={[styles.label, { color: world.colors.muted }]}>CREATE ONLINE ROOM</Text>
        <CrocatButton disabled={busy !== null || !hasSupabaseConfig} onPress={create}>
          {busy === 'create' ? 'CREATING…' : 'CREATE ROOM'}
        </CrocatButton>
      </CrocatCard>

      <Text style={[styles.or, { color: world.colors.muted }]}>OR ENTER A ROOM CODE</Text>

      <CrocatCard style={styles.card}>
        <Text style={[styles.label, { color: world.colors.muted }]}>ROOM CODE · JOIN OR CREATE</Text>
        <TextInput
          value={code}
          onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="CROC42"
          placeholderTextColor={world.colors.muted}
          maxLength={6}
          style={[
            styles.input,
            styles.code,
            {
              borderColor: world.colors.text,
              color: world.colors.text,
              backgroundColor: world.colors.canvas,
              borderRadius: world.shapes.cardRadius,
            },
          ]}
          autoCapitalize="characters"
        />
        <CrocatButton variant="secondary" disabled={busy !== null || !hasSupabaseConfig} onPress={join}>
          {busy === 'join' ? 'OPENING…' : 'JOIN / CREATE ROOM'}
        </CrocatButton>
      </CrocatCard>

      {busy && <ActivityIndicator style={{ marginTop: 16 }} color={world.colors.text} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.lg,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: { flex: 1 },
  kicker: { fontWeight: '900', letterSpacing: 1.3, fontSize: 10 },
  title: { marginTop: 6, fontSize: 38, lineHeight: 41, fontWeight: '900', letterSpacing: -1.5 },
  copy: { marginTop: 8, lineHeight: 20, fontSize: 14 },
  identityCard: { padding: 12, marginBottom: 12 },
  worldLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  worldName: { marginTop: 2, fontSize: 14, fontWeight: '900' },
  warning: { padding: 14, marginBottom: 12 },
  warningTitle: { fontWeight: '900' },
  warningText: { marginTop: 4, lineHeight: 18 },
  card: { gap: 10, padding: 16 },
  label: { fontWeight: '900', letterSpacing: 1.1, fontSize: 10 },
  input: { minHeight: 52, borderWidth: 2, paddingHorizontal: 14, fontSize: 16 },
  code: { fontWeight: '900', letterSpacing: 4, textAlign: 'center', fontSize: 22 },
  or: { marginVertical: 12, textAlign: 'center', fontWeight: '900', letterSpacing: 1 },
  error: { marginTop: 14, color: '#A74343', fontWeight: '700', textAlign: 'center' },
});
