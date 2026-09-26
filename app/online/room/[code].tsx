import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CrocatButton } from '@/src/components/CrocatButton';
import { RoomCodeDisplay } from '@/src/components/RoomCodeDisplay';
import { Screen } from '@/src/components/Screen';
import { RoomSettingsPanel } from '@/src/components/game/RoomSettingsPanel';
import { currentUser, ensureGuest } from '@/src/features/multiplayer/auth';
import {
  joinOrCreateRoom,
  leaveRoom,
  loadRoom,
  loadRoomById,
  setReady,
  startRound,
  updateRoomSettings,
} from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRoom } from '@/src/features/multiplayer/realtime';
import { rememberRoomCode } from '@/src/features/multiplayer/recentRoom';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors, radius, spacing } from '@/src/theme/tokens';

const HOST_NAME = 'Domi';
const JOINER_NAME = 'Sarah';

export default function OnlineRoomScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const {
    userId,
    room,
    players,
    onlineUserIds,
    setDisplayName,
    setIdentity,
    setRoomState,
    setOnlineUserIds,
    reset,
  } = useOnlineGameStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joinNotice, setJoinNotice] = useState('');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goHome = useCallback(() => {
    reset();
    router.replace('/');
  }, [reset, router]);

  const goPlay = useCallback(() => {
    reset();
    router.replace('/play');
  }, [reset, router]);

  const refresh = useCallback(async () => {
    if (!code) return;

    try {
      const state = await loadRoom(String(code));
      setRoomState(state.room, state.players, state.round);

      const activeUserId = useOnlineGameStore.getState().userId;
      const activeRole = useOnlineGameStore.getState().role;
      const me = activeUserId
        ? state.players.find((player) => player.user_id === activeUserId)
        : undefined;

      if (me && !activeRole) setIdentity(me.user_id, me.role);

      if (state.room.status === 'prompt_select' && state.round && me) {
        router.replace({
          pathname: '/online/prompt',
          params: {
            roomId: state.room.id,
            roundId: state.round.id,
          },
        });
        return;
      }

      if (state.room.status === 'drawing' && state.round && me) {
        router.replace({
          pathname: '/online/draw',
          params: {
            roomId: state.room.id,
            roundId: state.round.id,
            role: me.role,
            seconds: state.room.round_seconds,
            endsAt: state.round.ends_at,
          },
        });
        return;
      }

      if (state.room.status === 'adjusting' && state.round && me) {
        router.replace({
          pathname: '/online/adjust',
          params: {
            roomId: state.room.id,
            roundId: state.round.id,
            role: me.role,
          },
        });
        return;
      }

      if ((state.room.status === 'final_reveal' || state.room.status === 'reveal') && state.round) {
        router.replace({
          pathname: '/online/reveal',
          params: {
            roomId: state.room.id,
            roundId: state.round.id,
          },
        });
      }
    } catch {
      goPlay();
    }
  }, [code, goPlay, router, setIdentity, setRoomState]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError('');
        if (!code) return;

        const roomCode = String(code).trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
          goPlay();
          return;
        }

        let user = null;
        try {
          user = await currentUser();
        } catch {
          // A direct room link may be opened before Crocat created a guest session.
        }
        if (!user) user = await ensureGuest(JOINER_NAME);

        const ticket = await joinOrCreateRoom(roomCode, HOST_NAME, JOINER_NAME, 180);
        const initialState = await loadRoomById(ticket.roomId);
        const me = initialState.players.find((player) => player.user_id === user.id);
        if (!me) throw new Error('Room membership could not be established.');

        await rememberRoomCode(ticket.code);
        setDisplayName(me.display_name);
        setIdentity(user.id, me.role);
        setRoomState(initialState.room, initialState.players, initialState.round);

        await refresh();
        if (cancelled) return;

        const active = useOnlineGameStore.getState().room;
        if (!active) return;

        channelRef.current = await subscribeToRoom(
          active.id,
          user.id,
          me.display_name,
          {
            onSync: setOnlineUserIds,
            onPresenceJoin: (joinedUserId) => {
              const current = useOnlineGameStore.getState();
              if (current.room?.host_id !== user.id || joinedUserId === user.id) return;

              if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
              setJoinNotice('Sarah joined the room ✓');
              noticeTimerRef.current = setTimeout(() => setJoinNotice(''), 3500);
            },
            onRoomChange: refresh,
            onPlayerChange: refresh,
            onRoundChange: refresh,
          },
        );
      } catch {
        if (!cancelled) goPlay();
      }
    })();

    return () => {
      cancelled = true;
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      void removeChannel(channelRef.current);
    };
  }, [code]);

  const me = useMemo(
    () => players.find((player) => player.user_id === userId),
    [players, userId],
  );
  const isHost = Boolean(room && userId === room.host_id);
  const guest = players.find((player) => player.user_id !== room?.host_id);
  const guestReady = players.length === 2 && Boolean(guest?.ready);
  const allPlayersActive =
    players.length === 2
    && players.every((player) => onlineUserIds.includes(player.user_id));
  const missingPlayer = players.find((player) => !onlineUserIds.includes(player.user_id));

  const toggleReady = async () => {
    if (!room || !me || isHost) return;
    try {
      setBusy(true);
      await setReady(room.id, !me.ready);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update ready state.');
    } finally {
      setBusy(false);
    }
  };

  const changeRoundSeconds = async (seconds: number) => {
    if (!room || !isHost || busy || room.status !== 'waiting' || room.round_seconds === seconds) return;

    try {
      setBusy(true);
      setError('');
      await updateRoomSettings(room.id, seconds);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update room settings.');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!room) return;
    try {
      setBusy(true);
      await startRound(room.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start round.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!room || busy) return;
    try {
      setBusy(true);
      await leaveRoom(room.id);
    } catch {
      // Leaving should still return the player home if the room vanished first.
    } finally {
      goHome();
    }
  };

  if (!room && !error) {
    return <Screen><ActivityIndicator style={{ marginTop: 80 }} color={colors.ink} /></Screen>;
  }

  return (
    <Screen>
      <Text style={styles.back} onPress={leave}>← HOME / LEAVE</Text>
      <View style={styles.header}>
        <Text style={styles.kicker}>ROOM</Text>
        <RoomCodeDisplay code={String(code)} />
        <Text style={styles.copy}>Share this code or link. Roles are randomized every round. HEAD chooses the prompt, then both draw at the same time.</Text>
        {!!joinNotice && <Text style={styles.joinNotice}>{joinNotice}</Text>}
      </View>

      <View style={styles.players}>
        {players.map((player) => {
          const online = onlineUserIds.includes(player.user_id);
          return (
            <View key={player.user_id} style={styles.player}>
              <View>
                <Text style={styles.name}>{player.display_name}</Text>
                <Text style={styles.role}>ROLE · RANDOM EACH ROUND</Text>
              </View>
              <View style={styles.state}>
                <Text style={styles.online}>{online ? '● ONLINE' : '○ CONNECTING'}</Text>
                <Text style={styles.ready}>
                  {player.user_id === room?.host_id ? 'HOST' : (player.ready ? 'READY ✓' : 'NOT READY')}
                </Text>
              </View>
            </View>
          );
        })}
        {players.length < 2 && (
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>Waiting for the second player…</Text>
          </View>
        )}
      </View>

      {room && (
        <RoomSettingsPanel
          roundSeconds={room.round_seconds}
          editable={isHost && room.status === 'waiting'}
          busy={busy}
          onChange={changeRoundSeconds}
        />
      )}

      <View style={styles.bottom}>
        {isHost ? (
          <>
            <CrocatButton
              variant="coral"
              disabled={busy || !guestReady || !allPlayersActive || room?.status !== 'waiting'}
              onPress={start}
            >
              START ROUND
            </CrocatButton>
            <Text style={styles.hostNote}>
              {!allPlayersActive
                ? `Waiting for ${missingPlayer?.display_name ?? 'the other player'} to be active…`
                : (guestReady ? 'Both players are active and ready. Start when you are.' : 'Waiting for the guest to be ready…')}
            </Text>
          </>
        ) : (
          <>
            <CrocatButton disabled={busy || !me} onPress={toggleReady}>
              {me?.ready ? 'NOT READY' : 'I’M READY'}
            </CrocatButton>
            <Text style={styles.hostNote}>
              {me?.ready ? 'Ready. Waiting for Domi to start the round.' : 'Mark yourself ready when you are set.'}
            </Text>
          </>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  header: { marginTop: spacing.xl, marginBottom: spacing.xl },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.5, fontSize: 11 },
  copy: { marginTop: 8, color: colors.muted, lineHeight: 21 },
  joinNotice: { marginTop: 12, color: colors.ink, fontWeight: '900' },
  players: { gap: 12 },
  player: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink },
  head: { backgroundColor: colors.moss },
  body: { backgroundColor: colors.blue },
  name: { fontWeight: '900', fontSize: 18, color: colors.ink },
  role: { marginTop: 4, color: colors.ink, opacity: 0.6, fontWeight: '900', letterSpacing: 1.2, fontSize: 11 },
  state: { alignItems: 'flex-end', justifyContent: 'center' },
  online: { fontSize: 10, fontWeight: '900', color: colors.ink, opacity: 0.65 },
  ready: { marginTop: 5, fontSize: 11, fontWeight: '900', color: colors.ink },
  waiting: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, padding: 18, borderRadius: radius.md },
  waitingText: { color: colors.muted, textAlign: 'center', fontWeight: '700' },
  bottom: { marginTop: 'auto', gap: 10, paddingTop: 18 },
  hostNote: { textAlign: 'center', color: colors.muted, fontSize: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700' },
});
