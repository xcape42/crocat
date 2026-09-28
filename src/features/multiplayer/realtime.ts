import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import type { GameRole, PartTransform } from '@/src/types/game';
import { requireSupabase } from '@/src/lib/supabase';

const channelCleanup = new WeakMap<RealtimeChannel, () => void>();

type RoomRealtimeHandlers = {
  onSync?: (onlineUserIds: string[]) => void;
  onPresenceJoin?: (userId: string) => void;
  onPresenceLeave?: (userId: string) => void;
  onRoomChange?: () => void;
  onPlayerChange?: () => void;
  onRoundChange?: () => void;
  onKickSignal?: () => void;
};

export async function subscribeToRoom(
  roomId: string,
  userId: string,
  displayName: string,
  handlers: RoomRealtimeHandlers,
): Promise<RealtimeChannel> {
  const supabase = requireSupabase();

  const channel = supabase.channel(`room:${roomId}`, {
    config: { presence: { key: userId } },
  });

  const syncPresence = () => {
    const state = channel.presenceState();
    handlers.onSync?.(Object.keys(state));
  };

  channel
    .on('broadcast', { event: 'player_kicked' }, () => {
      handlers.onKickSignal?.();
    })
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
    })
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

  const trackActivePresence = async () => {
    await channel.track({
      user_id: userId,
      display_name: displayName,
      online_at: new Date().toISOString(),
      active: true,
    });
  };

  await new Promise<void>((resolve, reject) => {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        if (AppState.currentState === 'active') {
          await trackActivePresence();
        }
        handlers.onPlayerChange?.();
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Realtime channel failed: ${status}`));
      }
    });
  });

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void trackActivePresence();
    } else {
      void channel.untrack();
    }
  });

  channelCleanup.set(channel, () => appStateSubscription.remove());

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
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange();
    });
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
        onChange();
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

export async function broadcastPlayerKick(
  channel: RealtimeChannel,
  targetUserId: string,
) {
  await channel.send({
    type: 'broadcast',
    event: 'player_kicked',
    payload: { user_id: targetUserId },
  });
}

export async function removeChannel(channel: RealtimeChannel | null) {
  if (!channel) return;
  channelCleanup.get(channel)?.();
  channelCleanup.delete(channel);
  await requireSupabase().removeChannel(channel);
}
