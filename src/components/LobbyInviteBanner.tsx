import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/src/components/Mascot';
import { ensureCurrentProfile } from '@/src/features/profile/api';
import {
  acceptLobbyInvite,
  declineLobbyInvite,
  listLobbyInvites,
  removeSocialChannel,
  subscribeToSocial,
} from '@/src/features/social/api';
import type { LobbyInviteSummary } from '@/src/features/social/types';
import { socialProfileVisual } from '@/src/features/social/types';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { readableTextColor } from '@/src/theme/contrast';
import { crocatWorld } from '@/src/theme/worlds';

export function LobbyInviteBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const room = useOnlineGameStore((state) => state.room);
  const [invite, setInvite] = useState<LobbyInviteSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    try {
      const current = await listLobbyInvites();
      setInvite(current[0] ?? null);
    } catch {
      setInvite(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void ensureCurrentProfile()
      .then(() => {
        if (cancelled) return;
        void refresh();
        channelRef.current = subscribeToSocial(() => void refresh());
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      void removeSocialChannel(channelRef.current);
    };
  }, [refresh]);

  if (!invite || room) return null;

  const world = crocatWorld(invite.theme_key);

  const accept = async () => {
    try {
      setBusy(true);
      const ticket = await acceptLobbyInvite(invite.invite_id);
      setInvite(null);
      router.replace('/online/room/' + ticket.code);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    try {
      setBusy(true);
      await declineLobbyInvite(invite.invite_id);
      setInvite(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.shell,
        {
          top: insets.top + 8,
          borderColor: world.colors.text,
          backgroundColor: world.colors.surface,
          borderRadius: world.shapes.cardRadius,
        },
      ]}
    >
      <View style={styles.identity}>
        <Mascot profile={socialProfileVisual(invite)} state="happy" size={44} />
      </View>

      <View style={styles.copy}>
        <Text style={[styles.kicker, { color: world.colors.accent }]}>LOBBY INVITE</Text>
        <Text numberOfLines={1} style={[styles.name, { color: world.colors.text }]}>
          {invite.display_name} · {invite.room_code}
        </Text>
        <Text style={[styles.world, { color: world.colors.muted }]}>{world.label}</Text>
      </View>

      <Pressable
        disabled={busy}
        onPress={() => void accept()}
        style={[
          styles.action,
          {
            borderColor: world.colors.text,
            backgroundColor: world.colors.primary,
            borderRadius: world.shapes.buttonRadius,
          },
        ]}
      >
        <Text style={[styles.actionText, { color: readableTextColor(world.colors.primary) }]}>JOIN</Text>
      </Pressable>
      <Pressable
        disabled={busy}
        onPress={() => void decline()}
        style={[
          styles.action,
          {
            borderColor: world.colors.line,
            backgroundColor: world.colors.card,
            borderRadius: world.shapes.buttonRadius,
          },
        ]}
      >
        <Text style={[styles.actionText, { color: readableTextColor(world.colors.card) }]}>NO</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    zIndex: 1000,
    left: 12,
    right: 12,
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 10,
    borderWidth: 2,
  },
  identity: { alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  name: { marginTop: 2, fontSize: 13, fontWeight: '900' },
  world: { marginTop: 1, fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  action: {
    minHeight: 36,
    paddingHorizontal: 11,
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
});
