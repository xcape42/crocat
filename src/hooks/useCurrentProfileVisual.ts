import { useEffect, useState } from 'react';
import {
  ensureCurrentProfile,
  peekCurrentProfileVisual,
} from '@/src/features/profile/api';
import {
  profileToVisual,
  type ProfileVisual,
} from '@/src/features/profile/types';

export function useCurrentProfileVisual() {
  const [profile, setProfile] = useState<ProfileVisual | null>(
    peekCurrentProfileVisual,
  );

  useEffect(() => {
    if (profile) return;

    let cancelled = false;

    void ensureCurrentProfile()
      .then(({ profile: current }) => {
        if (!cancelled) setProfile(profileToVisual(current));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [profile]);

  return profile;
}
