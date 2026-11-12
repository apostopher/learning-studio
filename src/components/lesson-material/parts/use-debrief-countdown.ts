import { useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import {
  debriefCountdownAnnouncementAtom,
  debriefCountdownAtom,
} from '#/atoms/debrief';
import {
  formatCountdown,
  nextTickDelay,
  reopenRetryDelay,
} from '#/lib/format-countdown';
import { formatDebriefTime } from '#/lib/format-debrief-time';

/**
 * A grace second after zero before asking, so a client clock a moment ahead
 * of the server does not ask before the server agrees the debrief is open.
 */
const REFETCH_GRACE_MS = 1_000;

/**
 * Counts down to `availableAt` and asks again when it arrives.
 *
 * A ref timer, not state: each tick writes the ms left to
 * `debriefCountdownAtom` (every minute, every second under a minute, on the
 * display's own boundaries — `nextTickDelay`). A grace second after zero it
 * calls `refetch`; if the answer still says closed with the SAME time (the
 * server's clock a little behind), nothing re-renders this hook with a new
 * `availableAt`, so the tick re-arms itself and asks again, backing off
 * (`reopenRetryDelay`). A new `availableAt` restarts it; null stops it.
 *
 * Screen readers hear `debriefCountdownAnnouncementAtom`, set once per
 * `announceKey` — never on a tick, and not again when the same countdown's
 * time is corrected (a finished report's estimate replaced by the server's).
 * A null key announces nothing (the 12 h first wait). Client-only (an
 * effect), so the clock time is formatted in the pilot's own timezone.
 */
export function useDebriefCountdown(
  availableAt: string | null,
  refetch: () => Promise<unknown>,
  announceKey: string | null,
) {
  const setCountdown = useSetAtom(debriefCountdownAtom);
  const setAnnouncement = useSetAtom(debriefCountdownAnnouncementAtom);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest refetch, read when the tick fires: a new function identity
  // must not restart the countdown.
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);
  // The instant the announcement names, read when its key changes.
  const availableAtRef = useRef(availableAt);
  useEffect(() => {
    availableAtRef.current = availableAt;
  }, [availableAt]);

  useEffect(() => {
    const at = availableAtRef.current;
    if (announceKey === null || at === null) return;
    const opensAt = Date.parse(at);
    setAnnouncement(
      `Your next debrief opens in ${formatCountdown(opensAt - Date.now())}, at ${formatDebriefTime(at, new Date())}.`,
    );
    return () => setAnnouncement('');
  }, [announceKey, setAnnouncement]);

  useEffect(() => {
    if (availableAt === null) return;
    const opensAt = Date.parse(availableAt);
    let cancelled = false;
    let retry = 0;

    const schedule = (ms: number) => {
      timer.current = setTimeout(tick, ms);
    };
    function tick() {
      const msLeft = opensAt - Date.now();
      setCountdown({
        availableAt: availableAt as string,
        msLeft: Math.max(0, msLeft),
      });
      if (msLeft > 0) return schedule(nextTickDelay(msLeft));
      if (msLeft > -REFETCH_GRACE_MS)
        return schedule(msLeft + REFETCH_GRACE_MS);
      const rearm = () => {
        if (!cancelled) schedule(reopenRetryDelay(retry++));
      };
      refetchRef.current().then(rearm, rearm);
    }

    tick();

    return () => {
      cancelled = true;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [availableAt, setCountdown]);
}
