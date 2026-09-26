import type { RealtimeChannel } from '@supabase/supabase-js';
import { requireSupabase } from '@/src/lib/supabase';

type RoomRealtimeHandlers = {
  onSync?: (onlineUserIds: string[]) => void;
  onRoomChange?: () => void;
  onPlayerChange?: () => void;
  onRoundChange?: () => void;
};

export async function subscribeToRoom(
  roomId: string,
  userId: string,
  displayName: string,
  handlers: RoomRealtimeHandlers,
): Promise<RealtimeChannel> {
  const supabase = requireSupabase();

  const channel = supabase
    .channel(`room:${roomId}`, {
      config: { presence: { key: userId } },
    })
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      handlers.onSync?.(Object.keys(state));
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

  await new Promise<void>((resolve, reject) => {
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: userId, display_name: displayName, online_at: new Date().toISOString() });
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Realtime channel failed: ${status}`));
      }
    });
  });

  return channel;
}

export function subscribeToRound(
  roundId: string,
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
    .subscribe();
}

export async function removeChannel(channel: RealtimeChannel | null) {
  if (channel) await requireSupabase().removeChannel(channel);
}
