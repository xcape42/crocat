import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
import { CrocatButton } from '@/src/components/CrocatButton';
import { ProfileAvatar } from '@/src/components/ProfileAvatar';
import { RoomCodeDisplay } from '@/src/components/RoomCodeDisplay';
import { Screen } from '@/src/components/Screen';
import { RoomSettingsPanel } from '@/src/components/game/RoomSettingsPanel';
import { currentUser } from '@/src/features/multiplayer/auth';
import { ensureCurrentProfile } from '@/src/features/profile/api';
import {
  joinOrCreateRoom,
  kickRoomPlayer,
  leaveRoom,
  loadRoom,
  loadRoomById,
  setReady,
  startRound,
  updateRoomSettings,
} from '@/src/features/multiplayer/room';
import {
  broadcastPlayerKick,
  removeChannel,
  subscribeToRoom,
} from '@/src/features/multiplayer/realtime';
import { rememberRoomCode } from '@/src/features/multiplayer/recentRoom';
import {
  listFriendRequests,
  listFriends,
  removeSocialChannel,
  respondFriendRequest,
  sendFriendRequestToUser,
  subscribeToSocial,
} from '@/src/features/social/api';
import type {
  FriendRequestSummary,
  FriendSummary,
} from '@/src/features/social/types';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors, radius, spacing } from '@/src/theme/tokens';

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
  const [socialBusy, setSocialBusy] = useState('');
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequestSummary[]>([]);
  const [error, setError] = useState('');
  const [joinNotice, setJoinNotice] = useState('');
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [kickTargetId, setKickTargetId] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const socialChannelRef = useRef<RealtimeChannel | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goHome = useCallback(() => {
    reset();
    router.replace('/');
  }, [reset, router]);

  const goPlay = useCallback(() => {
    reset();
    router.replace('/play');
  }, [reset, router]);

  const refreshSocial = useCallback(async () => {
    try {
      const [nextFriends, nextRequests] = await Promise.all([
        listFriends(),
        listFriendRequests(),
      ]);
      setFriends(nextFriends);
      setFriendRequests(nextRequests);
    } catch {
      // Room play remains available if social metadata is temporarily unavailable.
    }
  }, []);

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

        const identity = await ensureCurrentProfile();
        user = user ?? identity.user;

        const ticket = await joinOrCreateRoom(
          roomCode,
          identity.profile.display_name,
          identity.profile.display_name,
          180,
        );
        const initialState = await loadRoomById(ticket.roomId);
        const me = initialState.players.find((player) => player.user_id === user.id);
        if (!me) throw new Error('Room membership could not be established.');

        await rememberRoomCode(ticket.code);
        setDisplayName(me.display_name);
        setIdentity(user.id, me.role);
        setRoomState(initialState.room, initialState.players, initialState.round);

        await Promise.all([refresh(), refreshSocial()]);
        if (cancelled) return;

        socialChannelRef.current = subscribeToSocial(() => void refreshSocial());

        const active = useOnlineGameStore.getState().room;
        if (!active) return;

        channelRef.current = await subscribeToRoom(
          active.id,
          user.id,
          me.display_name,
          {
            onSync: setOnlineUserIds,
            onRoomChange: refresh,
            onPlayerChange: refresh,
            onRoundChange: refresh,
            onKickSignal: refresh,
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
      void removeSocialChannel(socialChannelRef.current);
    };
  }, [code, refreshSocial]);

  const me = useMemo(
    () => players.find((player) => player.user_id === userId),
    [players, userId],
  );
  const readyCount = players.filter((player) => player.ready).length;
  const bothReady = players.length === 2 && readyCount === 2;
  const allPlayersActive =
    players.length === 2
    && players.every((player) => onlineUserIds.includes(player.user_id));
  const missingPlayer = players.find((player) => !onlineUserIds.includes(player.user_id));
  const otherPlayer = players.find((player) => player.user_id !== userId);
  const otherFriend = otherPlayer
    ? friends.find((friend) => friend.friend_user_id === otherPlayer.user_id)
    : undefined;
  const otherRequest = otherPlayer
    ? friendRequests.find((request) => request.other_user_id === otherPlayer.user_id)
    : undefined;
  const kickTarget = kickTargetId
    ? players.find((player) => player.user_id === kickTargetId)
    : undefined;

  const addOrAcceptFriend = async () => {
    if (!otherPlayer || socialBusy) return;

    try {
      setSocialBusy('relationship');
      setError('');

      if (otherRequest?.direction === 'incoming') {
        await respondFriendRequest(otherRequest.friendship_id, true);
        setJoinNotice('Friend added ✓');
      } else {
        await sendFriendRequestToUser(otherPlayer.user_id);
        setJoinNotice(
          otherRequest?.direction === 'outgoing'
            ? 'Friend request already sent'
            : 'Friend request sent ✓',
        );
      }

      await refreshSocial();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update friendship.');
    } finally {
      setSocialBusy('');
    }
  };

  const toggleReady = async () => {
    if (!room || !me || busy || room.status !== 'waiting') return;
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
    if (!room || !me || busy || room.status !== 'waiting' || room.round_seconds === seconds) return;

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

  const requestLeave = () => {
    if (!busy) setLeaveConfirmOpen(true);
  };

  const kickPlayer = async () => {
    if (!room || !kickTargetId || busy) return;

    try {
      setBusy(true);
      setError('');
      await kickRoomPlayer(room.id, kickTargetId);
      if (channelRef.current) {
        try {
          await broadcastPlayerKick(channelRef.current, kickTargetId);
        } catch {
          // The database removal is authoritative; a reconnect also forces a fresh room load.
        }
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove player.');
    } finally {
      setBusy(false);
      setKickTargetId(null);
    }
  };

  if (!room && !error) {
    return <Screen><ActivityIndicator style={{ marginTop: 80 }} color={colors.ink} /></Screen>;
  }

  return (
    <Screen backLabel="LEAVE" onBack={requestLeave}>
      <View style={styles.header}>
        <Text style={styles.kicker}>ONLINE LOBBY</Text>
        <View style={styles.codeRow}>
          <RoomCodeDisplay code={String(code)} />
        </View>
        <Text style={styles.copy}>Share the code or open All Friends to invite someone. Roles are randomized each round.</Text>
        {!!joinNotice && <Text style={styles.joinNotice}>{joinNotice}</Text>}
      </View>

      <View style={styles.players}>
        {players.map((player) => {
          const online = onlineUserIds.includes(player.user_id);
          return (
            <View key={player.user_id} style={styles.player}>
              <View style={styles.playerIdentity}>
                {player.profile ? (
                  <ProfileAvatar
                    profile={{
                      displayName: player.profile.display_name,
                      colorKey: player.profile.color_key,
                      avatarKey: player.profile.avatar_key,
                      themeKey: player.profile.theme_key,
                      symbolKey: player.profile.symbol_key,
                    }}
                    size={48}
                  />
                ) : null}
                <View style={styles.playerCopy}>
                  <Text style={styles.name}>{player.display_name}</Text>
                  <Text style={styles.role}>
                    {player.user_id === userId ? 'YOU' : 'OTHER CAT'}
                  </Text>
                  {player.user_id !== userId && (
                    otherFriend ? (
                      <Text style={styles.friendState}>
                        FRIENDS · LV {otherFriend.friend_level} · {otherFriend.friendship_label}
                      </Text>
                    ) : otherRequest?.direction === 'outgoing' ? (
                      <Text style={styles.requestState}>FRIEND REQUEST SENT</Text>
                    ) : (
                      <Pressable
                        disabled={!!socialBusy}
                        onPress={() => void addOrAcceptFriend()}
                        style={styles.addFriend}
                      >
                        <Text style={styles.addFriendText}>
                          {otherRequest?.direction === 'incoming'
                            ? '+ ACCEPT FRIEND'
                            : '+ ADD FRIEND'}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </View>
              <View style={styles.state}>
                {player.user_id !== userId && room?.status === 'waiting' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${player.display_name} from room`}
                    disabled={busy}
                    hitSlop={8}
                    onPress={() => setKickTargetId(player.user_id)}
                    style={({ pressed }) => [
                      styles.kickButton,
                      pressed && !busy && styles.kickButtonPressed,
                    ]}
                  >
                    <Text style={styles.kickButtonText}>×</Text>
                  </Pressable>
                )}
                <Text style={styles.online}>{online ? '● ONLINE' : '○ CONNECTING'}</Text>
                <Text style={styles.ready}>
                  {player.ready ? 'READY ✓' : 'NOT READY'}
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
          editable={Boolean(me) && room.status === 'waiting'}
          busy={busy}
          onChange={changeRoundSeconds}
        />
      )}

      <View style={styles.bottom}>
        {room?.status === 'waiting' && players.length < 2 && (
          <CrocatButton
            variant="secondary"
            disabled={busy || !me}
            onPress={() => router.push({
              pathname: '/friends',
              params: {
                inviteRoomId: room.id,
              },
            })}
          >
            ALL FRIENDS
          </CrocatButton>
        )}
        <CrocatButton disabled={busy || !me || room?.status !== 'waiting'} onPress={toggleReady}>
          {me?.ready ? 'NOT READY' : 'I’M READY'}
        </CrocatButton>
        <CrocatButton
          variant="coral"
          disabled={busy || !bothReady || !allPlayersActive || room?.status !== 'waiting'}
          onPress={start}
        >
          START ROUND
        </CrocatButton>
        <Text style={styles.lobbyNote}>
          {players.length < 2
            ? 'Waiting for the second player…'
            : (!allPlayersActive
              ? `Waiting for ${missingPlayer?.display_name ?? 'the other player'} to be active…`
              : (bothReady
                ? 'Both players are ready. Either player can start.'
                : `${readyCount}/2 ready. Both players must be ready to start.`))}
        </Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <ConfirmActionModal
        visible={leaveConfirmOpen}
        title="Leave this room?"
        message="You will leave the lobby and the other player will stay in the room."
        confirmLabel="YES, LEAVE"
        cancelLabel="NO"
        busy={busy}
        onCancel={() => setLeaveConfirmOpen(false)}
        onConfirm={() => void leave()}
      />

      <ConfirmActionModal
        visible={Boolean(kickTargetId)}
        title={`Remove ${kickTarget?.display_name ?? 'this player'}?`}
        message="They will be removed from this room. You can invite them again later."
        confirmLabel="YES, REMOVE"
        cancelLabel="NO"
        busy={busy}
        onCancel={() => setKickTargetId(null)}
        onConfirm={() => void kickPlayer()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  header: { marginTop: spacing.xl, marginBottom: spacing.lg },
  kicker: { color: colors.coral, fontWeight: '900', letterSpacing: 1.5, fontSize: 11 },
  codeRow: { marginTop: 6, alignItems: 'flex-start' },
  copy: { marginTop: 8, color: colors.muted, lineHeight: 21 },
  joinNotice: { marginTop: 12, color: colors.ink, fontWeight: '900' },
  players: { gap: 12 },
  player: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink },
  playerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  playerCopy: { flex: 1, minWidth: 0 },
  friendState: {
    marginTop: 5,
    color: '#4F7B4A',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  requestState: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  addFriend: {
    marginTop: 5,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.lime,
  },
  addFriendText: {
    color: colors.ink,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  head: { backgroundColor: colors.moss },
  body: { backgroundColor: colors.blue },
  name: { fontWeight: '900', fontSize: 18, color: colors.ink },
  role: { marginTop: 4, color: colors.ink, opacity: 0.6, fontWeight: '900', letterSpacing: 1.2, fontSize: 11 },
  state: { alignItems: 'flex-end', justifyContent: 'center' },
  kickButton: {
    width: 28,
    height: 28,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  kickButtonPressed: { opacity: 0.55, transform: [{ scale: 0.94 }] },
  kickButtonText: { color: colors.muted, fontSize: 20, lineHeight: 21, fontWeight: '800' },
  online: { fontSize: 10, fontWeight: '900', color: colors.ink, opacity: 0.65 },
  ready: { marginTop: 5, fontSize: 11, fontWeight: '900', color: colors.ink },
  waiting: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, padding: 18, borderRadius: radius.md },
  waitingText: { color: colors.muted, textAlign: 'center', fontWeight: '700' },
  bottom: { marginTop: 'auto', gap: 10, paddingTop: 18 },
  lobbyNote: { textAlign: 'center', color: colors.muted, fontSize: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700' },
});
