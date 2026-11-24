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
 * How long a debrief stays closed after its clock starts (the first attempt).
 * Overridable with `VITE_DEBRIEF_DELAY_MINUTES` (e.g. `1`)
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
   * When the debrief clock started — see `debriefClockStart`. Null until the
   * video is fully watched (a video lesson) or the lesson is done (no video).
   */
  clockStartAt: string | null;
  passed: boolean;
  /** When the most recent attempt on the version shown finished; gates a retake. */
  lastFinishedAt: string | null;
  /** An attempt is in progress: the pilot resumes it, whatever the clock says. */
  hasOpenAttempt: boolean;
  /**
   * An attempt has finished, on any version. Another version has no marks to
   * show and nothing to retake, but the delay is not served twice.
   */
  waitServed: boolean;
  /** Chunk mastery so far; null when the lesson has no chunks yet. */
  mastery: { cleared: number; total: number } | null;
};

export type DebriefState =
  | { kind: 'not-done' }
  | { kind: 'waiting'; availableAt: string } // the delay after the clock starts
  | { kind: 'open'; retake: boolean; resume: boolean; passed: boolean }
  | { kind: 'passed' };

/**
 * On a lesson with a video, the debrief clock starts the moment the pilot
 * finishes watching it — the same full watch that completes the video step —
 * and nothing else starts it: a lesson that does not require the video can be
 * done without it, and its debrief still waits for the watch. A lesson with no
 * video starts the clock when it is done.
 *
 * ISO instants in and out.
 */
export function debriefClockStart({
  hasVideo,
  videoWatchedAt,
  doneAt,
}: {
  hasVideo: boolean;
  videoWatchedAt: string | null;
  doneAt: string | null;
}): string | null {
  return hasVideo ? videoWatchedAt : doneAt;
}

export function computeDebriefState(
  facts: DebriefFacts,
  now: Date,
): DebriefState {
  // An open attempt wins over a pass: a learner who passed set 1 may have an
  // optional set 2 pending, and must be able to resume it.
  if (facts.hasOpenAttempt) {
    return {
      kind: 'open',
      retake: facts.lastFinishedAt !== null,
      resume: true,
      passed: facts.passed,
    };
  }
  if (facts.passed) return { kind: 'passed' };
  // A finished, unpassed attempt reopens at once: there is no retake wait.
  if (facts.lastFinishedAt !== null) {
    return { kind: 'open', retake: true, resume: false, passed: false };
  }

  if (facts.waitServed) {
    return { kind: 'open', retake: false, resume: false, passed: false };
  }

  if (facts.clockStartAt === null) return { kind: 'not-done' };
  const availableMs = Date.parse(facts.clockStartAt) + DEBRIEF_DELAY_MS;
  if (now.getTime() >= availableMs) {
    return { kind: 'open', retake: false, resume: false, passed: false };
  }
  return { kind: 'waiting', availableAt: new Date(availableMs).toISOString() };
}

/**
 * Ring badge.
 * - 'debrief': due and not yet attempted (or a first attempt in progress).
 * - 'retake': an attempt has finished without a pass — from that first fail
 *   until a pass.
 * - 'passed': passed, including an open attempt (a pending offer) after a pass.
 * - null: not done yet, or still in the 12h wait.
 */
export function debriefBadge(
  state: DebriefState,
): 'debrief' | 'retake' | 'passed' | null {
  switch (state.kind) {
    case 'open':
      if (state.passed) return 'passed';
      return state.retake ? 'retake' : 'debrief';
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
