import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { resumeActiveOnlineSession } from '@/src/features/multiplayer/session';

export function OnlineSessionGate() {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const runningRef = useRef(false);

  pathRef.current = pathname;

  useEffect(() => {
    let cancelled = false;

    const resume = async (force = false) => {
      if (cancelled || runningRef.current) return;
      runningRef.current = true;
      try {
        await resumeActiveOnlineSession(router, pathRef.current, force);
      } finally {
        runningRef.current = false;
      }
    };

    void resume(pathRef.current === '/');

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resume(true);
    });

    const watchdog = setInterval(() => {
      if (AppState.currentState === 'active') void resume(false);
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(watchdog);
      appState.remove();
    };
  }, [router]);

  return null;
}
