import { useEffect, useMemo, useState } from 'react';
import { CountdownBadge } from '@/src/components/CountdownBadge';
import { useDeadlineCountdown, type DeadlineValue } from '@/src/hooks/useDeadlineCountdown';

type Props = {
  seconds: number;
  endsAt?: DeadlineValue;
  onComplete: () => void;
};

export function Timer({ seconds, endsAt, onComplete }: Props) {
  const [localDeadline, setLocalDeadline] = useState(() => Date.now() + seconds * 1000);

  useEffect(() => {
    if (endsAt == null) {
      setLocalDeadline(Date.now() + seconds * 1000);
    }
  }, [endsAt, seconds]);

  const deadline = useMemo(
    () => endsAt ?? localDeadline,
    [endsAt, localDeadline],
  );
  const remaining = useDeadlineCountdown(deadline, onComplete);

  return <CountdownBadge remaining={remaining} />;
}
