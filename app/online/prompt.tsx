import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CountdownBadge } from '@/src/components/CountdownBadge';
import { CrocatButton } from '@/src/components/CrocatButton';
import { Screen } from '@/src/components/Screen';
import { currentUser } from '@/src/features/multiplayer/auth';
import {
  advancePrompt,
  loadRoomById,
  rerollPrompt,
  selectPrompt,
} from '@/src/features/multiplayer/room';
import { removeChannel, subscribeToRound } from '@/src/features/multiplayer/realtime';
import { useDeadlineCountdown } from '@/src/hooks/useDeadlineCountdown';
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

  const remaining = useDeadlineCountdown(
    round?.id === roundId ? round.prompt_selection_ends_at : null,
    autoChoose,
  );

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
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.copy}>{error || 'Preparing prompt choices…'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
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
        <CountdownBadge remaining={remaining} label="PICK" />
      </View>

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
            <Text style={styles.action}>{isHead ? 'CHOOSE' : 'HEAD CAN CHOOSE'}</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 },
  headerText: { flex: 1 },
  kicker: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { marginTop: 5, color: colors.ink, fontSize: 30, lineHeight: 33, fontWeight: '900', letterSpacing: -1.1 },
  copy: { marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 17 },
  options: { flex: 1, minHeight: 0, justifyContent: 'center', gap: 10 },
  option: { padding: 18, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card },
  optionReadonly: { borderColor: colors.line },
  optionPressed: { transform: [{ scale: 0.985 }], backgroundColor: colors.lime },
  theme: { color: colors.coral, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  term: { marginTop: 4, color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  action: { marginTop: 7, color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  footer: { flexShrink: 0, gap: 8 },
  waiting: { textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { color: '#A74343', textAlign: 'center', fontWeight: '700', fontSize: 11 },
});
