const SECOND = 1_000;
const MINUTE = 60_000;

/** Whole seconds left, rounded up: the display never shows less than remains. */
const secondsLeft = (msLeft: number) => Math.ceil(Math.max(0, msLeft) / SECOND);

/**
 * Time until a debrief opens, as the pilot reads it: "5 h 40 min", "40 min",
 * "45 s", "0 s" at or past zero. Seconds only under a minute. Minutes and
 * seconds round UP, so it never shows less time than remains — the tab is
 * never announced open before it is.
 */
export function formatCountdown(msLeft: number): string {
  const seconds = secondsLeft(msLeft);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.ceil(msLeft / MINUTE);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Milliseconds until `formatCountdown(msLeft)` next changes: on the minute
 * boundary while minutes show (so at most a minute), on the second boundary
 * under a minute. Ticking on the boundary, not every 60 s from whenever the
 * page opened, keeps the display from lagging up to a minute behind.
 */
export function nextTickDelay(msLeft: number): number {
  if (secondsLeft(msLeft) < 60) return msLeft % SECOND || SECOND;
  // Minutes show until 59 s is left; the last minute's change is to "59 s".
  return Math.min(msLeft % MINUTE || MINUTE, msLeft - 59 * SECOND);
}

/**
 * How long to wait before asking again when the countdown reached zero but
 * the server still says closed (its clock a little behind ours, or a stale
 * read): 5 s, doubling, at most a minute.
 */
export function reopenRetryDelay(retry: number): number {
  return Math.min(5 * SECOND * 2 ** retry, MINUTE);
}
