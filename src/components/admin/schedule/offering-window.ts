import { addDays, differenceInCalendarDays, format } from 'date-fns';

/**
 * The arithmetic behind the offering dialog's three date controls.
 *
 * Start, end and window-in-days are two facts and a convenience: the window
 * is always `end - start`, never stored. Kept here as pure functions rather
 * than inline in the dialog because inclusive date maths is exactly the kind
 * of off-by-one that needs its own tests.
 *
 * Every date is `yyyy-MM-dd` in local time. Parsed from parts rather than
 * `new Date(string)`, which reads the string as UTC midnight and lands on the
 * previous day for anyone west of Greenwich.
 */
export function parseDayKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects a well-shaped but impossible date — 2026-02-31 rolls over to
  // 3 March, and accepting it would silently move the offering.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/**
 * Days from start to end, BOTH ENDS INCLUDED.
 *
 * A run that starts and ends on the same day is one day long, not zero: the
 * student has that day to work in. Returns null if either date is unusable or
 * the end precedes the start.
 */
export function windowDaysBetween(
  startsOn: string,
  endsOn: string,
): number | null {
  const from = parseDayKey(startsOn);
  const to = parseDayKey(endsOn);
  if (!from || !to) return null;
  const days = differenceInCalendarDays(to, from) + 1;
  return days >= 1 ? days : null;
}

/** The end date `days` long, counting the start day as day one. */
export function endDateFromWindow(
  startsOn: string,
  days: number,
): string | null {
  const from = parseDayKey(startsOn);
  if (!from || !Number.isInteger(days) || days < 1) return null;
  return format(addDays(from, days - 1), 'yyyy-MM-dd');
}

/**
 * "103 calendar days — 14 weeks and 5 days".
 *
 * The weeks breakdown is the point: nobody can tell at a glance whether 103
 * days is a reasonable ground-school window, and "14 weeks and 5 days" is the
 * unit the decision is actually made in. Omitted below a week, where it would
 * only restate the number.
 */
export function formatWindowSummary(
  startsOn: string,
  endsOn: string,
): string | null {
  const days = windowDaysBetween(startsOn, endsOn);
  if (days === null) return null;

  const dayWord = days === 1 ? 'day' : 'days';
  if (days < 7) return `${days} calendar ${dayWord}`;

  const weeks = Math.floor(days / 7);
  const remainder = days % 7;
  const weekPart = `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  const breakdown =
    remainder === 0
      ? weekPart
      : `${weekPart} and ${remainder} ${remainder === 1 ? 'day' : 'days'}`;
  return `${days} calendar ${dayWord} — ${breakdown}`;
}
