import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  hasServerClockSync,
  serverNowMs,
  subscribeServerClock,
  syncServerClock,
} from '@/src/features/time/serverClock';

export type DeadlineValue = string | number | Date;
export type DeadlineClock = 'local' | 'server';

function deadlineToMs(deadline: DeadlineValue | null | undefined) {
  if (deadline == null) return null;
  if (typeof deadline === 'number') return deadline;
  if (deadline instanceof Date) return deadline.getTime();
  const parsed = new Date(deadline).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function currentTimeMs(clock: DeadlineClock) {
  return clock === 'server' ? serverNowMs() : Date.now();
}

function secondsUntil(
  deadlineMs: number | null,
  clock: DeadlineClock,
) {
  if (deadlineMs == null) return 0;
  return Math.max(
    0,
    Math.ceil((deadlineMs - currentTimeMs(clock)) / 1000),
  );
}

export function useDeadlineCountdown(
  deadline: DeadlineValue | null | undefined,
  onComplete?: () => void,
  options?: {
    clock?: DeadlineClock;
  },
) {
  const clock = options?.clock ?? 'local';
  const deadlineMs = useMemo(() => deadlineToMs(deadline), [deadline]);
  const [, setTick] = useState(0);
  const firedDeadlineRef = useRef<number | null>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    let completionTimer: ReturnType<typeof setTimeout> | null = null;
    let clockSyncInterval: ReturnType<typeof setInterval> | null = null;

    const sync = () => {
      setTick((tick) => (tick + 1) % 1000000);

      const canComplete =
        clock === 'local'
        || hasServerClockSync();

      if (
        canComplete
        && deadlineMs != null
        && currentTimeMs(clock) >= deadlineMs
        && firedDeadlineRef.current !== deadlineMs
      ) {
        firedDeadlineRef.current = deadlineMs;
        completeRef.current?.();
      }
    };

    const syncClock = async (force = false) => {
      if (clock !== 'server') return;

      try {
        await syncServerClock({ force });
      } finally {
        sync();
      }
    };

    const unsubscribeClock =
      clock === 'server'
        ? subscribeServerClock(sync)
        : () => undefined;

    sync();

    if (clock === 'server') {
      void syncClock();
      clockSyncInterval = setInterval(
        () => void syncClock(true),
        60_000,
      );
    }

    const interval = setInterval(sync, 100);

    if (deadlineMs != null) {
      const delay = Math.max(
        0,
        deadlineMs - currentTimeMs(clock),
      );
      completionTimer = setTimeout(sync, delay + 2);
    }

    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;

      if (clock === 'server') {
        void syncClock(true);
      } else {
        sync();
      }
    });

    return () => {
      clearInterval(interval);
      if (completionTimer) clearTimeout(completionTimer);
      if (clockSyncInterval) clearInterval(clockSyncInterval);
      unsubscribeClock();
      appState.remove();
    };
  }, [clock, deadlineMs]);

  return secondsUntil(deadlineMs, clock);
}
