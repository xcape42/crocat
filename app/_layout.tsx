import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LobbyInviteBanner } from '@/src/components/LobbyInviteBanner';
import { ensureCurrentProfile, touchProfilePresence } from '@/src/features/profile/api';
import { touchRoomPresence } from '@/src/features/multiplayer/room';
import { syncServerClock } from '@/src/features/time/serverClock';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { colors } from '@/src/theme/tokens';

export default function RootLayout() {
  const roomId = useOnlineGameStore((state) => state.room?.id ?? null);

  useEffect(() => {
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const touch = async () => {
      if (stopped || AppState.currentState !== 'active') return;

      try {
        if (roomId) {
          await touchRoomPresence(roomId);
        } else {
          await touchProfilePresence();
        }
      } catch {
        // Route refreshes and the next heartbeat recover transient offline state.
      }
    };

    void ensureCurrentProfile()
      .then(() => {
        if (stopped) return;
        void syncServerClock();
        void touch();
        interval = setInterval(() => void touch(), 20_000);
      })
      .catch(() => {
        // Online screens surface backend/auth errors when the user interacts.
      });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncServerClock({ force: true });
        void touch();
      }
    });

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      subscription.remove();
    };
  }, [roomId]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
          animation: 'fade',
        }}
      />
      <LobbyInviteBanner />
    </SafeAreaProvider>
  );
}
