import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '@/src/components/ProfileAvatar';
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
import { colors, radius } from '@/src/theme/tokens';

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
    <View style={[styles.shell, { top: insets.top + 8 }]}>
      <ProfileAvatar profile={socialProfileVisual(invite)} size={44} />
      <View style={styles.copy}>
        <Text style={styles.kicker}>LOBBY INVITE</Text>
        <Text numberOfLines={1} style={styles.name}>
          {invite.display_name} · {invite.room_code}
        </Text>
      </View>
      <Pressable
        disabled={busy}
        onPress={() => void accept()}
        style={styles.join}
      >
        <Text style={styles.actionText}>JOIN</Text>
      </Pressable>
      <Pressable
        disabled={busy}
        onPress={() => void decline()}
        style={styles.no}
      >
        <Text style={styles.actionText}>NO</Text>
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
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
  },
  copy: { flex: 1, minWidth: 0 },
  kicker: { color: colors.coral, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  name: { marginTop: 2, color: colors.ink, fontSize: 13, fontWeight: '900' },
  join: {
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.lime,
  },
  no: {
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  actionText: { color: colors.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
});
