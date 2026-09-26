import { AppState, Platform } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameRole, PartTransform } from '@/src/types/game';
import { requireSupabase } from '@/src/lib/supabase';

type RoomRealtimeHandlers = {
  onSync?: (onlineUserIds: string[]) => void;
  onActiveSync?: (activeUserIds: string[]) => void;
  onPresenceJoin?: (userId: string) => void;
  onPresenceLeave?: (userId: string) => void;
  onRoomChange?: () => void;
  onPlayerChange?: () => void;
  onRoundChange?: () => void;
};

type PresenceMeta = {
  user_id?: string;
  display_name?: string;
  online_at?: string;
  is_active?: boolean;
};

type VisibilityDocument = {
  visibilityState?: string;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

const activityCleanup = new WeakMap<RealtimeChannel, () => void>();

function visibilityDocument(): VisibilityDocument | null {
  if (Platform.OS !== 'web') return null;
  return ((globalThis as typeof globalThis & { document?: VisibilityDocument }).document ?? null);
}

function attachPresenceHandlers(
  channel: RealtimeChannel,
  handlers: RoomRealtimeHandlers,
) {
  const syncPresence = () => {
    const state = channel.presenceState() as Record<string, PresenceMeta[]>;
    const onlineUserIds = Object.keys(state);
    const activeUserIds = Object.entries(state)
      .filter(([, presences]) => presences.some((presence) => presence.is_active === true))
      .map(([userId]) => userId);

    handlers.onSync?.(onlineUserIds);
    handlers.onActiveSync?.(activeUserIds);
  };

  channel
    .on('presence', { event: 'sync' }, () => {
      syncPresence();
      handlers.onPlayerChange?.();
    })
    .on('presence', { event: 'join' }, ({ key }) => {
      syncPresence();
      handlers.onPresenceJoin?.(String(key));
      handlers.onPlayerChange?.();
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      syncPresence();
      handlers.onPresenceLeave?.(String(key));
      handlers.onPlayerChange?.();
    });
}

async function subscribeAndTrack(
  channel: RealtimeChannel,
  userId: string,
  displayName: string,
) {
  let appState = AppState.currentState;
  const doc = visibilityDocument();

  const isActive = () => {
    const appActive = appState == null || appState === 'active';
    const pageVisible = !doc || doc.visibilityState !== 'hidden';
    return appActive && pageVisible;
  };

  const track = async () => {
    await channel.track({
      user_id: userId,
      display_name: displayName,
      online_at: new Date().toISOString(),
      is_active: isActive(),
    });
  };

  await new Promise<void>((resolve, reject) => {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await track();
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Realtime channel failed: ${status}`));
      }
    });
  });

  const appStateSub = AppState.addEventListener('change', (nextState) => {
    appState = nextState;
    void track();
  });

  const onVisibilityChange = () => {
    void track();
  };
  doc?.addEventListener('visibilitychange', onVisibilityChange);

  activityCleanup.set(channel, () => {
    appStateSub.remove();
    doc?.removeEventListener('visibilitychange', onVisibilityChange);
  });
}

export async function subscribeToRoom(
  roomId: string,
  userId: string,
  displayName: string,
  handlers: RoomRealtimeHandlers,
): Promise<RealtimeChannel> {
  const channel = requireSupabase().channel(`room:${roomId}`, {
    config: { presence: { key: userId } },
  });

  attachPresenceHandlers(channel, handlers);

  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      () => handlers.onRoomChange?.(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      () => handlers.onPlayerChange?.(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_rounds', filter: `room_id=eq.${roomId}` },
      () => handlers.onRoundChange?.(),
    );

  await subscribeAndTrack(channel, userId, displayName);
  return channel;
}

export async function subscribeToRoomPresence(
  roomId: string,
  userId: string,
  displayName: string,
  handlers: RoomRealtimeHandlers,
): Promise<RealtimeChannel> {
  const channel = requireSupabase().channel(`room:${roomId}`, {
    config: { presence: { key: userId } },
  });

  attachPresenceHandlers(channel, handlers);
  await subscribeAndTrack(channel, userId, displayName);
  return channel;
}

export function subscribeToRound(
  roundId: string,
  roomId: string,
  onChange: () => void,
): RealtimeChannel {
  return requireSupabase()
    .channel(`round:${roundId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_rounds', filter: `id=eq.${roundId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'submissions', filter: `round_id=eq.${roundId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      onChange,
    )
    .subscribe();
}

export async function subscribeToAdjustment(
  roundId: string,
  roomId: string,
  onTransform: (role: GameRole, transform: PartTransform) => void,
  onChange: () => void,
): Promise<RealtimeChannel> {
  const channel = requireSupabase()
    .channel(`adjust:${roundId}`)
    .on('broadcast', { event: 'part_transform' }, ({ payload }) => {
      const role = payload?.role;
      const transform = payload?.transform;

      if (
        (role === 'HEAD' || role === 'BODY')
        && transform
        && typeof transform.x === 'number'
        && typeof transform.y === 'number'
        && typeof transform.scale === 'number'
      ) {
        onTransform(role, transform as PartTransform);
      }
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_rounds', filter: `id=eq.${roundId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'submissions', filter: `round_id=eq.${roundId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
      onChange,
    );

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Adjustment channel failed: ${status}`));
      }
    });
  });

  return channel;
}

export async function broadcastTransform(
  channel: RealtimeChannel,
  role: GameRole,
  transform: PartTransform,
) {
  await channel.send({
    type: 'broadcast',
    event: 'part_transform',
    payload: { role, transform },
  });
}

export async function removeChannel(channel: RealtimeChannel | null) {
  if (!channel) return;
  activityCleanup.get(channel)?.();
  activityCleanup.delete(channel);
  await requireSupabase().removeChannel(channel);
}
