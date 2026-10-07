import { utc } from '@date-fns/utc';
import { addDays, differenceInSeconds, startOfDay } from 'date-fns';
import {
  DAILY_LIMIT_SECONDS,
  MIN_START_SECONDS,
  PER_CALL_LIMIT_SECONDS,
} from '#/lib/video-call-contract';

/** How long past its reservation an `active` row may sit before it's treated
 * as abandoned (Tavus normally ends it within 30 s of the learner leaving). */
export const STALE_GRACE_SECONDS = 120;

export interface UsageRow {
  status: 'active' | 'ended';
  reservedSeconds: number;
  durationSeconds: number | null;
}

export interface Allowance {
  remainingSeconds: number;
  resetsAt: Date;
  canStart: boolean;
  reservedSecondsIfStarted: number;
}

/** The daily limit resets at 00:00 UTC — the app has no per-user time zone. */
export function utcDayWindow(now: Date): { start: Date; resetsAt: Date } {
  const start = startOfDay(now, { in: utc });
  return { start, resetsAt: addDays(start, 1, { in: utc }) };
}

/** The least an ended call is charged — see `usedSeconds`. */
export const MIN_CHARGED_SECONDS = 60;

/** Ended calls count what they used; active ones count their whole
 * reservation until they end (unused time is given back then).
 *
 * Each ended call counts at least `MIN_CHARGED_SECONDS`: Tavus bills by the
 * minute, so without a floor many very short calls would each cost us a
 * billed minute while barely touching the learner's daily limit. */
export function usedSeconds(rows: UsageRow[]): number {
  return rows.reduce(
    (sum, row) =>
      sum +
      (row.status === 'active'
        ? row.reservedSeconds
        : Math.max(
            MIN_CHARGED_SECONDS,
            row.durationSeconds ?? row.reservedSeconds,
          )),
    0,
  );
}

/** `rows` must already be limited to calls started since `utcDayWindow(now).start`. */
export function computeAllowance(rows: UsageRow[], now: Date): Allowance {
  const remainingSeconds = Math.max(0, DAILY_LIMIT_SECONDS - usedSeconds(rows));
  return {
    remainingSeconds,
    resetsAt: utcDayWindow(now).resetsAt,
    canStart: remainingSeconds >= MIN_START_SECONDS,
    reservedSecondsIfStarted: Math.min(
      PER_CALL_LIMIT_SECONDS,
      remainingSeconds,
    ),
  };
}

export function clampDuration(
  startedAt: Date,
  endedAt: Date,
  reservedSeconds: number,
): number {
  return Math.min(
    reservedSeconds,
    Math.max(0, differenceInSeconds(endedAt, startedAt)),
  );
}

export function isStale(
  row: { startedAt: Date; reservedSeconds: number },
  now: Date,
): boolean {
  return (
    differenceInSeconds(now, row.startedAt) >
    row.reservedSeconds + STALE_GRACE_SECONDS
  );
}
