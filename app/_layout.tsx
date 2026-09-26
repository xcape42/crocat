import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/src/theme/tokens';
import { touchRoomPresence } from '@/src/features/multiplayer/room';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';

export default function RootLayout() {
  const roomId = useOnlineGameStore((state) => state.room?.id ?? null);

  useEffect(() => {
    if (!roomId) return;

    let stopped = false;
    const touch = () => {
      if (stopped || AppState.currentState !== 'active') return;
      void touchRoomPresence(roomId).catch(() => {
        // Realtime/route refreshes handle a room that disappeared while offline.
      });
    };

    touch();
    const interval = setInterval(touch, 20_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') touch();
    });

    return () => {
      stopped = true;
      clearInterval(interval);
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
    </SafeAreaProvider>
  );
}
