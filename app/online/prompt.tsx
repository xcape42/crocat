import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ConfirmActionModal } from '@/src/components/ConfirmActionModal';
import { CountdownBadge } from '@/src/components/CountdownBadge';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Mascot } from '@/src/components/Mascot';
import { profileToVisual } from '@/src/features/profile/types';
import { Screen } from '@/src/components/Screen';
import { currentUser } from '@/src/features/multiplayer/auth';
import {
  advancePrompt,
  leaveRoom,
  loadRoomById,
  rerollPrompt,
  selectPrompt,
} from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRound } from '@/src/features/multiplayer/realtime';
import { useDeadlineCountdown } from '@/src/hooks/useDeadlineCountdown';
import { useReliablePhaseSync } from '@/src/hooks/useReliablePhaseSync';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors, radius } from '@/src/theme/tokens';
import type { PromptOption } from '@/src/features/multiplayer/types';

export default function OnlinePromptScreen() {
  const router = useRouter();
  const { roomId, roundId } = useLocalSearchParams<{ roomId: string; roundId: string }>();
  const {
    userId,
    room,
    round,
    players,
    setIdentity,
    setRoomState,
    reset,
  } = useOnlineGameStore();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const advancingRef = useRef(false);

  const goHome = useCallback(() => {
    reset();
    router.replace('/');
  }, [reset, router]);

  const refresh = useCallback(async () => {
    if (!roomId || !roundId) return;

    try {
      const state = await loadRoomById(roomId);
      setRoomState(state.room, state.players, state.round);

      const activeUserId = useOnlineGameStore.getState().userId;
      const me = activeUserId
        ? state.players.find((player) => player.user_id === activeUserId)
        : undefined;

      if (!me || !state.round) return;

      if (state.room.status === 'drawing' && state.round.id === roundId) {
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

      if (state.room.status === 'waiting') {
        router.replace(`/online/room/${state.room.code}`);
      }
    } catch {
      goHome();
    }
  }, [goHome, roomId, roundId, router, setRoomState]);

  useReliablePhaseSync({
    roomId,
    roundId,
    screen: 'prompt',
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const user = await currentUser();
        if (!user) throw new Error('Guest session missing.');
        if (!userId) setIdentity(user.id);

        await refresh();
        if (cancelled || !roomId || !roundId) return;

        channelRef.current = subscribeToRound(roundId, roomId, () => {
          void refresh();
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load prompt selection.');
      }
    })();

    return () => {
      cancelled = true;
      void removeChannel(channelRef.current);
    };
  }, []);

  const autoChoose = useCallback(async () => {
    if (!roundId || advancingRef.current) return;
    advancingRef.current = true;
    try {
      await advancePrompt(roundId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish prompt selection.');
    } finally {
      advancingRef.current = false;
    }
  }, [refresh, roundId]);

  const leave = async () => {
    if (!roomId || busy) return;
    try {
      setBusy(true);
      await leaveRoom(roomId);
    } catch {
      // Returning home is still correct if the room disappeared first.
    } finally {
      goHome();
    }
  };

  const requestLeave = () => {
    if (!busy) setLeaveConfirmOpen(true);
  };

  const timerWaiting =
    round?.id === roundId
    && round.phase_timer_started_at === null;
  const promptDeadline =
    round?.id === roundId && !timerWaiting
      ? round.prompt_selection_ends_at
      : null;
  const countdownRemaining = useDeadlineCountdown(
    promptDeadline,
    autoChoose,
    { clock: 'server' },
  );
  const remaining = timerWaiting ? 15 : countdownRemaining;

  const me = players.find((player) => player.user_id === userId);
  const isHead = Boolean(userId && round?.head_player_id === userId);
  const headName =
    players.find((player) => player.user_id === round?.head_player_id)?.display_name ?? 'HEAD player';
  const options = (round?.prompt_options ?? []) as PromptOption[];

  const choose = async (term: string) => {
    if (!roundId || !isHead || busy) return;
    try {
      setBusy(true);
      setError('');
      await selectPrompt(roundId, term);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not choose prompt.');
    } finally {
      setBusy(false);
    }
  };

  const reroll = async () => {
    if (!roundId || !isHead || busy || round?.prompt_reroll_used) return;
    try {
      setBusy(true);
      setError('');
      await rerollPrompt(roundId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reroll prompts.');
    } finally {
      setBusy(false);
    }
  };

  if (!room || !round) {
    return (
      <Screen scroll={false} backLabel="LEAVE" onBack={requestLeave}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.copy}>{error || 'Preparing prompt choices…'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen} backLabel="LEAVE" onBack={requestLeave} decorations="quiet">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>ROOM {room.code} · PROMPT PICK</Text>
          <Text style={styles.title}>
            {isHead ? 'Pick what you will draw.' : `${headName} is choosing.`}
          </Text>
          <Text style={styles.copy}>
            Three prompts, three different themes. The theme disappears once drawing starts.
          </Text>
        </View>
        <View style={styles.headerActions}>
          <CountdownBadge remaining={remaining} label="PICK" />
          {!!me?.profile && (
            <Mascot
              profile={profileToVisual(me.profile)}
              state={isHead ? 'curious' : 'waiting'}
              size={44}
            />
          )}
        </View>
      </View>

      {!isHead && (
        <View style={styles.watchOnly}>
          <Text style={styles.watchOnlyLabel}>WATCH ONLY</Text>
          <Text style={styles.watchOnlyText}>
            {headName} is choosing the prompt. You can follow the choice live, but only HEAD can interact.
          </Text>
        </View>
      )}
      
      <View style={styles.options}>
        {options.map((option) => (
          <Pressable
            key={`${option.theme}-${option.term}`}
            disabled={!isHead || busy}
            onPress={() => choose(option.term)}
            style={({ pressed }) => [
              styles.option,
              !isHead && styles.optionReadonly,
              pressed && isHead && styles.optionPressed,
            ]}
          >
            <Text style={styles.theme}>{option.theme.toUpperCase()}</Text>
            <Text style={styles.term}>{option.term}</Text>
            <Text style={styles.parts}>
              {(option.headLabel ?? 'HEAD').toUpperCase()} · {(option.bodyLabel ?? 'BODY').toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        {isHead ? (
          <CrocatButton
            variant="secondary"
            disabled={busy || Boolean(round.prompt_reroll_used)}
            onPress={reroll}
          >
            {round.prompt_reroll_used ? 'REROLL USED' : 'NEW 3 · 1× REROLL'}
          </CrocatButton>
        ) : (
          <Text style={styles.waiting}>You are BODY this round. Watch the choice happen live.</Text>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <ConfirmActionModal
        visible={leaveConfirmOpen}
        title="Leave the game?"
        message="The current round will end for the room."
        confirmLabel="YES, LEAVE"
        cancelLabel="NO"
        busy={busy}
        onCancel={() => setLeaveConfirmOpen(false)}
        onConfirm={() => void leave()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 },
  headerText: { flex: 1 },
  headerActions: { alignItems: 'center', gap: 6, flexShrink: 0 },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { marginTop: 5, color: colors.ink, fontSize: 30, lineHeight: 33, fontWeight: '900', letterSpacing: -1.1 },
  copy: { marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 17 },
  watchOnly: {
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.moss,
  },
  watchOnlyLabel: {
    color: colors.coral,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  watchOnlyText: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  options: { flex: 1, minHeight: 0, justifyContent: 'center', gap: 10 },
  option: { padding: 18, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card },
  optionReadonly: { border: 'none', opacity: 0.78, backgroundColor: 'transparent' },
  optionPressed: { transform: [{ scale: 0.985 }], backgroundColor: colors.lime },
  theme: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  term: { marginTop: 4, color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  parts: { marginTop: 5, color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  action: { marginTop: 7, color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  footer: { flexShrink: 0, gap: 8 },
  waiting: { textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700', fontSize: 11 },
});
