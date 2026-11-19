import { useEffect, useRef } from 'react';
import { reopenRetryDelay } from '#/lib/format-countdown';

/**
 * A grace second after zero before asking, so a client clock a moment ahead
 * of the server does not ask before the server agrees the debrief is open.
 */
const REFETCH_GRACE_MS = 1_000;

/**
 * Waits for `availableAt` (the 12 h first-debrief wait) and asks again when
 * it arrives.
 *
 * A ref timer, not state. A grace second after the instant it calls
 * `refetch`; if the answer still says closed with the SAME time (the
 * server's clock a little behind), nothing re-renders this hook with a new
 * `availableAt`, so the timer re-arms itself and asks again, backing off
 * (`reopenRetryDelay`). A new `availableAt` restarts it; null stops it.
 */
export function useDebriefCountdown(
  availableAt: string | null,
  refetch: () => Promise<unknown>,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest refetch, read when the timer fires: a new function identity
  // must not restart the wait.
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (availableAt === null) return;
    const opensAt = Date.parse(availableAt);
    let cancelled = false;
    let retry = 0;

    const schedule = (ms: number) => {
      timer.current = setTimeout(ask, ms);
    };
    function ask() {
      const rearm = () => {
        if (!cancelled) schedule(reopenRetryDelay(retry++));
      };
      refetchRef.current().then(rearm, rearm);
    }

    schedule(Math.max(0, opensAt - Date.now()) + REFETCH_GRACE_MS);

    return () => {
      cancelled = true;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [availableAt]);
}
