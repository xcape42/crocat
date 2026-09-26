import { useCallback, useRef } from 'react';

/**
 * Coalesces bursts of async refresh requests into one in-flight task plus,
 * at most, one final refresh with the latest arguments.
 *
 * Realtime can emit several row-change events for one logical phase change
 * (room + round + submissions). Serializing them prevents duplicate fetches
 * and duplicate router.replace calls while still guaranteeing a final refresh.
 */
export function useCoalescedAsync<TArgs extends unknown[]>(
  task: (...args: TArgs) => Promise<void>,
) {
  const taskRef = useRef(task);
  const queuedArgsRef = useRef<TArgs | null>(null);
  const runningRef = useRef<Promise<void> | null>(null);

  taskRef.current = task;

  return useCallback((...args: TArgs) => {
    queuedArgsRef.current = args;

    if (runningRef.current) {
      return runningRef.current;
    }

    const run = (async () => {
      while (queuedArgsRef.current) {
        const nextArgs = queuedArgsRef.current;
        queuedArgsRef.current = null;
        await taskRef.current(...nextArgs);
      }
    })();

    const settled = run.finally(() => {
      if (runningRef.current === settled) {
        runningRef.current = null;
      }
    });

    runningRef.current = settled;
    return settled;
  }, []);
}
