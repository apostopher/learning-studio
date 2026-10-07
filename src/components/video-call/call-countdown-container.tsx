import { useAtomValue } from 'jotai';
import { nowAtom } from '#/atoms/video-call';
import { WARNING_AT_SECONDS } from '#/lib/video-call-contract';
import { formatCountdown, secondsUntil } from '#/lib/video-call-copy';
import { CallTimeWarning } from './call-time-warning';

/** The only readers of the ticking clock, so only these re-render each second. */
export function CallCountdownContainer({ endsAt }: { endsAt: string }) {
  const now = useAtomValue(nowAtom);
  return (
    <>
      <span className="sr-only">Time left </span>
      {formatCountdown(secondsUntil(endsAt, now))}
    </>
  );
}

export function CallTimeWarningContainer({ endsAt }: { endsAt: string }) {
  const now = useAtomValue(nowAtom);
  const left = secondsUntil(endsAt, now);
  return <CallTimeWarning visible={left > 0 && left <= WARNING_AT_SECONDS} />;
}
