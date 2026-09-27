import { requireSupabase } from '@/src/lib/supabase';

type ClockSample = {
  offsetMs: number;
  rttMs: number;
};

let offsetMs = 0;
let syncedAtMs = 0;
let syncPromise: Promise<number> | null = null;
const listeners = new Set<() => void>();

async function sampleServerClock(): Promise<ClockSample> {
  const startedAt = Date.now();
  const { data, error } = await requireSupabase().rpc('server_clock_ms');
  const finishedAt = Date.now();

  if (error) throw error;

  const serverMs = Number(data);
  if (!Number.isFinite(serverMs)) {
    throw new Error('Server clock returned an invalid timestamp.');
  }

  const clientMidpoint = startedAt + ((finishedAt - startedAt) / 2);

  return {
    offsetMs: serverMs - clientMidpoint,
    rttMs: finishedAt - startedAt,
  };
}

export function getServerClockOffsetMs() {
  return offsetMs;
}

export function hasServerClockSync() {
  return syncedAtMs > 0;
}

export function serverNowMs() {
  return Date.now() + offsetMs;
}

export function subscribeServerClock(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function syncServerClock(options?: {
  force?: boolean;
}): Promise<number> {
  const force = options?.force ?? false;

  if (!force && syncedAtMs > 0 && Date.now() - syncedAtMs < 60_000) {
    return offsetMs;
  }

  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const samples: ClockSample[] = [];

    for (let index = 0; index < 3; index += 1) {
      try {
        samples.push(await sampleServerClock());
      } catch {
        // Keep trying. One transient request must not invalidate the timer.
      }
    }

    if (!samples.length) {
      if (syncedAtMs > 0) return offsetMs;
      throw new Error('Could not synchronize server clock.');
    }

    samples.sort((left, right) => left.rttMs - right.rttMs);
    offsetMs = samples[0].offsetMs;
    syncedAtMs = Date.now();
    listeners.forEach((listener) => listener());

    return offsetMs;
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}
