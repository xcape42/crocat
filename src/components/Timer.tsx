import { useMemo } from 'react';
import { CountdownBadge } from '@/src/components/CountdownBadge';
import { useDeadlineCountdown, type DeadlineValue } from '@/src/hooks/useDeadlineCountdown';

type Props = {
  seconds: number;
  endsAt?: DeadlineValue;
  onComplete: () => void;
};

export function Timer({ seconds, endsAt, onComplete }: Props) {
  const localDeadline = useMemo(
    () => Date.now() + seconds * 1000,
    [seconds],
  );
  const remaining = useDeadlineCountdown(endsAt ?? localDeadline, onComplete);

  return <CountdownBadge remaining={remaining} />;
}
