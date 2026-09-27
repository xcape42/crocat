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
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { crocatUiTheme } from '@/src/theme/profileTheme';

export default function RootLayout() {
  const roomId = useOnlineGameStore((state) => state.room?.id ?? null);
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const setThemeKey = useUiThemeStore((state) => state.setThemeKey);
  const uiTheme = crocatUiTheme(themeKey);

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
      .then(({ profile }) => {
        if (stopped) return;
        setThemeKey(profile.theme_key);
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
  }, [roomId, setThemeKey]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: uiTheme.background },
          animation: 'fade',
        }}
      />
      <LobbyInviteBanner />
    </SafeAreaProvider>
  );
}
