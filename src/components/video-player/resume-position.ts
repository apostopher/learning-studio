/**
 * Resume-where-you-left-off, as pure decisions. The container and the lesson
 * player call these from effects; they live here because this repo cannot
 * render-test its own hook-calling components (see `use-milestone-reporter.ts`).
 */

/** The saved playhead, as `GET /api/user/video-progress` returns it. */
export type SavedPosition = { seconds: number; duration: number };

/**
 * Where to put the playhead on load. `undefined` means still loading (wait),
 * `null` means start at 0:00.
 */
export type ResumeTarget =
  | { kind: 'time'; seconds: number }
  | { kind: 'end' }
  | null
  | undefined;

/**
 * Within this of the end counts as finished: `timeupdate` fires about every
 * 250ms, so the last reading before `ended` can trail `duration` a little.
 */
const FINISHED_EPSILON_SECONDS = 1;
/** A position this early is not worth resuming. */
const MIN_RESUME_SECONDS = 1;
/** How often a playing video saves its position. */
export const SAVE_INTERVAL_MS = 10_000;

export function resumeTargetFrom(
  saved: SavedPosition | null | undefined,
): ResumeTarget {
  if (saved === undefined) return undefined;
  if (saved === null || saved.seconds < MIN_RESUME_SECONDS) return null;
  if (saved.seconds >= saved.duration - FINISHED_EPSILON_SECONDS) {
    // Parked at the end: the bar reads full, and Play on an ended media
    // element restarts from 0:00 natively.
    return { kind: 'end' };
  }
  return { kind: 'time', seconds: saved.seconds };
}

export type ResumeSeekInput = {
  target: ResumeTarget;
  /** `HTMLMediaElement.readyState`; seeking needs at least HAVE_METADATA (1). */
  readyState: number;
  paused: boolean;
  currentTime: number;
  duration: number;
};

/**
 * Whether to apply the resume seek now. `settle: true` means "done for this
 * mount, never try again". The learner always wins: once they have pressed
 * play or moved the playhead, a position that arrives late is dropped rather
 * than yanking them somewhere else.
 */
export function resumeSeek({
  target,
  readyState,
  paused,
  currentTime,
  duration,
}: ResumeSeekInput): { settle: boolean; seekTo: number | null } {
  if (target === undefined || readyState < 1) {
    return { settle: false, seekTo: null };
  }
  if (target === null || !paused || currentTime > 0.5) {
    return { settle: true, seekTo: null };
  }
  const end = Number.isFinite(duration) && duration > 0 ? duration : null;
  if (target.kind === 'end') return { settle: true, seekTo: end };
  return {
    settle: true,
    seekTo: end === null ? target.seconds : Math.min(target.seconds, end),
  };
}

export type PositionSaveState = {
  /** The learner has pressed play on this video during this visit. */
  played: boolean;
  paused: boolean;
  lastSavedAt: number;
  lastSavedSeconds: number | null;
};

export const initialPositionSaveState: PositionSaveState = {
  played: false,
  paused: true,
  lastSavedAt: 0,
  lastSavedSeconds: null,
};

export type PositionSaveInput = {
  paused: boolean;
  currentTime: number;
  duration: number;
  /** Wall clock, ms. */
  now: number;
};

/**
 * Per-tick decision: save on pause (which includes reaching the end) and
 * every `SAVE_INTERVAL_MS` while playing. Nothing is saved until the learner
 * plays, so loading the page — and the resume seek itself — never overwrites
 * the saved position.
 */
export function computePositionSave(
  prev: PositionSaveState,
  { paused, currentTime, duration, now }: PositionSaveInput,
): { state: PositionSaveState; save: SavedPosition | null } {
  const startedPlaying = prev.paused && !paused;
  const played = prev.played || !paused;
  let state: PositionSaveState = { ...prev, played, paused };
  // The interval counts from when playback started, not from page load.
  if (startedPlaying) state = { ...state, lastSavedAt: now };

  if (!played || !(duration > 0)) return { state, save: null };

  const justPaused = !prev.paused && paused;
  const due = !paused && now - state.lastSavedAt >= SAVE_INTERVAL_MS;
  if (!justPaused && !due) return { state, save: null };

  const save = { seconds: Math.min(currentTime, duration), duration };
  return {
    state: { ...state, lastSavedAt: now, lastSavedSeconds: save.seconds },
    save,
  };
}

/**
 * What to send as the learner leaves (navigation or a hidden tab): the
 * current position, unless it is already saved or they never played.
 */
export function positionToFlush(
  state: PositionSaveState,
  { currentTime, duration }: { currentTime: number; duration: number },
): SavedPosition | null {
  if (!state.played || !(duration > 0)) return null;
  const seconds = Math.min(currentTime, duration);
  if (
    state.lastSavedSeconds !== null &&
    Math.abs(seconds - state.lastSavedSeconds) < 1
  ) {
    return null;
  }
  return { seconds, duration };
}
