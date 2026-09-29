import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { AppState, Platform } from 'react-native';
import type { GameRole } from '@/src/types/game';
import {
  enablePhaseTimerSync,
  enterPhase,
  loadRoomPhaseSnapshot,
} from '@/src/features/multiplayer/room';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';

type OnlinePhaseScreen = 'lobby' | 'prompt' | 'drawing' | 'adjusting' | 'reveal';

type Options = {
  roomId?: string | null;
  roundId?: string | null;
  screen: OnlinePhaseScreen;
  fallbackRole?: GameRole | null;
  enabled?: boolean;
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 2_500;

function browserVisible() {
  if (Platform.OS !== 'web') return true;
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

function shouldPoll() {
  if (Platform.OS === 'web') return browserVisible();
  return AppState.currentState === 'active';
}

function roleForCurrentUser(
  round: Awaited<ReturnType<typeof loadRoomPhaseSnapshot>>['round'],
  fallbackRole?: GameRole | null,
): GameRole | null {
  const current = useOnlineGameStore.getState();
  const userId = current.userId;

  if (round && userId === round.head_player_id) return 'HEAD';
  if (round && userId === round.body_player_id) return 'BODY';
  return fallbackRole ?? current.role ?? null;
}

export function useReliablePhaseSync({
  roomId,
  roundId,
  screen,
  fallbackRole,
  enabled = true,
  intervalMs = DEFAULT_INTERVAL_MS,
}: Options) {
  const router = useRouter();
  const inFlightRef = useRef(false);
  const timerSyncEnabledRef = useRef(false);
  const enteredPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !roomId) return;

    let cancelled = false;

    const reconcile = async (force = false) => {
      if (cancelled || inFlightRef.current) return;
      if (!force && !shouldPoll()) return;

      inFlightRef.current = true;

      try {
        if (!timerSyncEnabledRef.current) {
          try {
            await enablePhaseTimerSync(roomId);
            timerSyncEnabledRef.current = true;
          } catch {
            // Backward-compatible during rollout; retry on the next reconcile.
          }
        }

        const state = await loadRoomPhaseSnapshot(roomId);
        if (cancelled) return;

        const { room, round } = state;
        const sameRound = Boolean(round && round.id === roundId);

        if (room.status === 'waiting') {
          if (screen !== 'lobby') router.replace('/online/room/' + room.code);
          return;
        }

        if (room.status === 'prompt_select' && round) {
          if (screen !== 'prompt' || !sameRound) {
            router.replace({
              pathname: '/online/prompt',
              params: { roomId: room.id, roundId: round.id },
            });
          } else {
            const key = round.id + ':prompt_select';
            if (enteredPhaseRef.current !== key) {
              try {
                await enterPhase(round.id, 'prompt_select');
                enteredPhaseRef.current = key;
              } catch {
                // Retry through the reliable reconciliation loop.
              }
            }
          }
          return;
        }

        if (room.status === 'drawing' && round) {
          const role = roleForCurrentUser(round, fallbackRole);
          if (!role) return;

          if (screen !== 'drawing' || !sameRound) {
            router.replace({
              pathname: '/online/draw',
              params: {
                roomId: room.id,
                roundId: round.id,
                role,
                seconds: room.round_seconds,
                endsAt: round.ends_at,
              },
            });
          } else {
            const key = round.id + ':drawing';
            if (enteredPhaseRef.current !== key) {
              try {
                await enterPhase(round.id, 'drawing');
                enteredPhaseRef.current = key;
              } catch {
                // Retry through the reliable reconciliation loop.
              }
            }
          }
          return;
        }

        if (room.status === 'adjusting' && round) {
          const role = roleForCurrentUser(round, fallbackRole);
          if (!role) return;

          if (screen !== 'adjusting' || !sameRound) {
            router.replace({
              pathname: '/online/adjust',
              params: { roomId: room.id, roundId: round.id, role },
            });
          } else {
            const key = round.id + ':adjusting';
            if (enteredPhaseRef.current !== key) {
              try {
                await enterPhase(round.id, 'adjusting');
                enteredPhaseRef.current = key;
              } catch {
                // Retry through the reliable reconciliation loop.
              }
            }
          }
          return;
        }

        if ((room.status === 'final_reveal' || room.status === 'reveal') && round) {
          if (screen !== 'reveal' || !sameRound) {
            router.replace({
              pathname: '/online/reveal',
              params: { roomId: room.id, roundId: round.id },
            });
          } else {
            const key = round.id + ':final_reveal';
            if (enteredPhaseRef.current !== key) {
              try {
                await enterPhase(round.id, 'final_reveal');
                enteredPhaseRef.current = key;
              } catch {
                // Retry through the reliable reconciliation loop.
              }
            }
          }
        }
      } catch {
        // Realtime and normal screen refreshes remain primary. The safety
        // reconcile is intentionally non-fatal during transient network loss.
      } finally {
        inFlightRef.current = false;
      }
    };

    void reconcile(true);

    const interval = setInterval(
      () => void reconcile(false),
      Math.max(1_500, intervalMs),
    );

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile(true);
    });

    const onFocus = () => void reconcile(true);
    const onOnline = () => void reconcile(true);
    const onVisibility = () => {
      if (browserVisible()) void reconcile(true);
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
      window.addEventListener('online', onOnline);
      document?.addEventListener?.('visibilitychange', onVisibility);
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      appState.remove();

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onOnline);
        document?.removeEventListener?.('visibilitychange', onVisibility);
      }
    };
  }, [enabled, fallbackRole, intervalMs, roomId, roundId, router, screen]);
}
