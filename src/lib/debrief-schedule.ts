export const DEBRIEF_PAR_SCORE = 70;
/** 12 hours, unless `VITE_DEBRIEF_DELAY_MINUTES` says otherwise. */
const DEFAULT_DEBRIEF_DELAY_MINUTES = 12 * 60;

/**
 * `VITE_DEBRIEF_DELAY_MINUTES` as a positive number of minutes, else the
 * 12-hour default. Anything unusable falls back rather than throwing: `env.ts`
 * already rejects a bad value at server boot, and a typo must never open
 * every debrief at once.
 */
export function parseDebriefDelayMinutes(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_DEBRIEF_DELAY_MINUTES;
  }
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes > 0
    ? minutes
    : DEFAULT_DEBRIEF_DELAY_MINUTES;
}

/** "12 hours", "1 hour", "90 minutes", "1 minute". */
export function formatDebriefDelay(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * How long a debrief stays closed after its clock starts, and after a
 * below-par attempt. Overridable with `VITE_DEBRIEF_DELAY_MINUTES` (e.g. `1`)
 * to test locally. A VITE_ variable, not a server one: the sidebar ring
 * computes the debrief state in the browser too, and the two must agree.
 */
export const DEBRIEF_DELAY_MINUTES = parseDebriefDelayMinutes(readDelayEnv());

/**
 * Server: `process.env` — the dev server, production and the tsx scripts all
 * run in Node with it loaded (`load-env.ts`, or Vercel). NOT
 * `import.meta.env` there: Vite's SSR module runner hands modules a proxy
 * that throws on every `import.meta.env` read.
 *
 * Browser: `import.meta.env`, which Vite fills from the same VITE_ variable.
 * Both read the one value, so the sidebar ring and the server agree.
 */
function readDelayEnv(): unknown {
  if (typeof window === 'undefined') {
    return process.env.VITE_DEBRIEF_DELAY_MINUTES;
  }
  return import.meta.env.VITE_DEBRIEF_DELAY_MINUTES;
}
export const DEBRIEF_DELAY_MS = DEBRIEF_DELAY_MINUTES * 60_000;
/** The delay as the pilot reads it: "12 hours". */
export const DEBRIEF_DELAY_LABEL = formatDebriefDelay(DEBRIEF_DELAY_MINUTES);

/** ISO strings — these cross the wire inside CourseProgress. */
export type DebriefFacts = {
  /**
   * When the debrief clock started — see `debriefClockStart`. Null while
   * neither the video is watched nor the lesson done.
   */
  clockStartAt: string | null;
  passed: boolean;
  lastFailedAt: string | null;
};

export type DebriefState =
  | { kind: 'not-done' }
  | { kind: 'waiting'; availableAt: string } // the delay after the clock starts
  | { kind: 'open'; retake: boolean }
  | { kind: 'retake-waiting'; availableAt: string } // after a below-par attempt
  | { kind: 'passed' };

/**
 * The debrief clock starts the moment the pilot finishes watching the video,
 * or when the lesson is done, whichever came first. A video lesson therefore
 * starts it on the video alone; a lesson with no video (or whose video was
 * never watched) starts it when the lesson is done.
 *
 * Both inputs are ISO instants; the result is too.
 */
export function debriefClockStart(
  videoWatchedAt: string | null,
  doneAt: string | null,
): string | null {
  if (videoWatchedAt === null) return doneAt;
  if (doneAt === null) return videoWatchedAt;
  return Date.parse(videoWatchedAt) <= Date.parse(doneAt)
    ? videoWatchedAt
    : doneAt;
}

export function computeDebriefState(
  facts: DebriefFacts,
  now: Date,
): DebriefState {
  if (facts.passed) return { kind: 'passed' };
  if (facts.clockStartAt === null) return { kind: 'not-done' };

  const startMs = Date.parse(facts.clockStartAt);
  const failedMs = facts.lastFailedAt ? Date.parse(facts.lastFailedAt) : null;

  if (failedMs === null) {
    const availableMs = startMs + DEBRIEF_DELAY_MS;
    if (now.getTime() >= availableMs) return { kind: 'open', retake: false };
    return {
      kind: 'waiting',
      availableAt: new Date(availableMs).toISOString(),
    };
  }

  // The retake window runs from whichever is later: the clock start or the
  // most recent failed attempt (backfilled history can put a failure before
  // the clock start).
  const availableMs = Math.max(startMs, failedMs) + DEBRIEF_DELAY_MS;
  if (now.getTime() >= availableMs) return { kind: 'open', retake: true };
  return {
    kind: 'retake-waiting',
    availableAt: new Date(availableMs).toISOString(),
  };
}

export function isPass(totalScore: number): boolean {
  return totalScore >= DEBRIEF_PAR_SCORE;
}

/** Ring badge: 'debrief' for open and retake-waiting, 'passed' for passed, else null. */
export function debriefBadge(state: DebriefState): 'debrief' | 'passed' | null {
  switch (state.kind) {
    case 'open':
    case 'retake-waiting':
      return 'debrief';
    case 'passed':
      return 'passed';
    case 'not-done':
    case 'waiting':
      return null;
  }
}

/** The longest delay `setTimeout` honours; anything above it fires at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Milliseconds from `now` until the ISO instant `iso`, for scheduling a
 * refetch the moment a debrief opens. Clamped to `[0, 2^31-1]`: a past instant
 * fires at once, and a far-future one waits the longest a timer can rather
 * than overflowing to an immediate fire.
 */
export function msUntil(iso: string, now: Date): number {
  const ms = Date.parse(iso) - now.getTime();
  return Math.min(Math.max(ms, 0), MAX_TIMEOUT_MS);
}
