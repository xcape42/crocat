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
  const [remaining, setRemaining] = useState(() => secondsUntil(deadlineMs));
  const firedRef = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    firedRef.current = false;

    const sync = () => {
      const next = secondsUntil(deadlineMs);
      setRemaining(next);

      if (deadlineMs != null && next === 0 && !firedRef.current) {
        firedRef.current = true;
        setTimeout(() => completeRef.current?.(), 0);
      }
    };

    sync();
    const interval = setInterval(sync, 250);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [deadlineMs]);

  return remaining;
}
