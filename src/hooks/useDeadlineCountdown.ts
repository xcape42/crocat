import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type DeadlineValue = string | number | Date;

function deadlineToMs(deadline: DeadlineValue | null | undefined) {
  if (deadline == null) return null;
  if (typeof deadline === 'number') return deadline;
  if (deadline instanceof Date) return deadline.getTime();
  const parsed = new Date(deadline).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function secondsUntil(deadlineMs: number | null) {
  if (deadlineMs == null) return 0;
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
}

export function useDeadlineCountdown(
  deadline: DeadlineValue | null | undefined,
  onComplete?: () => void,
) {
  const deadlineMs = useMemo(() => deadlineToMs(deadline), [deadline]);
  const [, setTick] = useState(0);
  const firedDeadlineRef = useRef<number | null>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    let completionTimer: ReturnType<typeof setTimeout> | null = null;

    const sync = () => {
      setTick((tick) => (tick + 1) % 1000000);

      if (
        deadlineMs != null
        && Date.now() >= deadlineMs
        && firedDeadlineRef.current !== deadlineMs
      ) {
        firedDeadlineRef.current = deadlineMs;
        completeRef.current?.();
      }
    };

    sync();
    const interval = setInterval(sync, 100);

    if (deadlineMs != null) {
      const delay = Math.max(0, deadlineMs - Date.now());
      completionTimer = setTimeout(sync, delay + 2);
    }

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      clearInterval(interval);
      if (completionTimer) clearTimeout(completionTimer);
      appState.remove();
    };
  }, [deadlineMs]);

  return secondsUntil(deadlineMs);
}
