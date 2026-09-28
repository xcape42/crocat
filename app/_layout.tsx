import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LobbyInviteBanner } from '@/src/components/LobbyInviteBanner';
import { ensureCurrentProfile, touchProfilePresence } from '@/src/features/profile/api';
import { loadCachedWorldKey } from '@/src/features/profile/themeCache';
import { touchRoomPresence } from '@/src/features/multiplayer/room';
import { syncServerClock } from '@/src/features/time/serverClock';
import { useOnlineGameStore } from '@/src/store/onlineGameStore';
import { useUiThemeStore } from '@/src/store/uiThemeStore';
import { crocatUiTheme } from '@/src/theme/profileTheme';
import { normalizeWorldKey } from '@/src/theme/worlds';

type BootstrapResult =
  | { source: 'cache'; themeKey: Awaited<ReturnType<typeof loadCachedWorldKey>> }
  | { source: 'server'; themeKey: ReturnType<typeof normalizeWorldKey> }
  | { source: 'server-error' };

export default function RootLayout() {
  const roomId = useOnlineGameStore((state) => state.room?.id ?? null);
  const themeKey = useUiThemeStore((state) => state.themeKey);
  const themeReady = useUiThemeStore((state) => state.themeReady);
  const setThemeKey = useUiThemeStore((state) => state.setThemeKey);
  const profileBootstrapRef = useRef<Promise<void> | null>(null);
  const uiTheme = crocatUiTheme(themeKey);

  useEffect(() => {
    let stopped = false;
    let expectedRevision = useUiThemeStore.getState().themeRevision;

    const cachePromise = loadCachedWorldKey();
    const serverPromise = ensureCurrentProfile()
      .then(({ profile }) => normalizeWorldKey(profile.theme_key));

    profileBootstrapRef.current = serverPromise.then(() => undefined);

    const applyBootstrapTheme = (
      nextThemeKey: ReturnType<typeof normalizeWorldKey>,
      persist: boolean,
    ) => {
      if (stopped || useUiThemeStore.getState().themeRevision !== expectedRevision) {
        return false;
      }

      setThemeKey(nextThemeKey, { persist });
      expectedRevision = useUiThemeStore.getState().themeRevision;
      return true;
    };

    const bootstrap = async () => {
      const first: BootstrapResult = await Promise.race([
        cachePromise.then((cachedThemeKey) => ({
          source: 'cache' as const,
          themeKey: cachedThemeKey,
        })),
        serverPromise
          .then((serverThemeKey) => ({
            source: 'server' as const,
            themeKey: serverThemeKey,
          }))
          .catch(() => ({ source: 'server-error' as const })),
      ]);

      if (stopped) return;

      if (first.source === 'server') {
        applyBootstrapTheme(first.themeKey, true);
        return;
      }

      if (first.source === 'cache' && first.themeKey) {
        applyBootstrapTheme(first.themeKey, false);
      }

      try {
        const serverThemeKey = await serverPromise;
        applyBootstrapTheme(serverThemeKey, true);
      } catch {
        if (stopped || useUiThemeStore.getState().themeReady) return;

        const cachedThemeKey = first.source === 'cache'
          ? first.themeKey
          : await cachePromise;

        if (!stopped) {
          setThemeKey(cachedThemeKey ?? 'moss', { persist: false });
        }
      }
    };

    void bootstrap();

    return () => {
      stopped = true;
    };
  }, [setThemeKey]);

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

    const startHeartbeat = async () => {
      try {
        await profileBootstrapRef.current;
      } catch {
        // Local play remains available if the profile backend is temporarily unavailable.
      }

      if (stopped) return;

      void syncServerClock();
      void touch();
      interval = setInterval(() => void touch(), 20_000);
    };

    void startHeartbeat();

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

  if (!themeReady) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.bootstrap}>
          <Text style={styles.bootstrapLogo}>crocat.</Text>
        </View>
      </SafeAreaProvider>
    );
  }

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

const styles = StyleSheet.create({
  bootstrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F2EC',
  },
  bootstrapLogo: {
    color: '#4E4A45',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
});
