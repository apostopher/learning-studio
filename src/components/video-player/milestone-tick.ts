import {
  crossedMilestones,
  isVideoWatched,
  SEEK_THRESHOLD_SECONDS,
} from '#/lib/course-milestones';

/**
 * Ref-like state carried between ticks of the milestone reporter. Plain data
 * (not React refs) so the decision logic in `computeMilestoneTick` is a pure
 * function, testable without rendering a component or hook — see the note
 * atop `use-milestone-reporter.ts` for why that matters in this repo.
 */
export type MilestoneReporterState = {
  lessonSlug: string | null;
  reported: ReadonlySet<number>;
  seededFor: string | null;
  lastTime: number;
  reconciled: boolean;
};

export const initialMilestoneReporterState: MilestoneReporterState = {
  lessonSlug: null,
  reported: new Set(),
  seededFor: null,
  lastTime: 0,
  reconciled: false,
};

export type MilestoneTickInput = {
  lessonSlug: string;
  currentTime: number;
  duration: number;
  /** `useVideoProgress(lessonSlug).data?.milestonesHit` — undefined until the seed lands. */
  milestonesHit: number[] | undefined;
};

export type MilestoneTickResult = {
  state: MilestoneReporterState;
  /** Milestones newly crossed on this tick (already reflected in `state.reported`). */
  crossed: number[];
  /** True on the single tick where coverage completes; caller should reconcile. */
  shouldReconcile: boolean;
};

/**
 * Pure per-tick decision for the milestone reporter: given the previous
 * state and the current inputs, computes the next state, which milestones
 * (if any) were newly crossed, and whether reconciliation should fire.
 *
 * Intended to be called on EVERY commit that could change any input —
 * currentTime, duration, lessonSlug, or milestonesHit — i.e. all four belong
 * in the calling effect's dependency array. That is what makes this safe
 * where the two-effect version it replaced was not: a `useEffect` with deps
 * `[lessonSlug, milestonesHit]` only re-runs when THOSE deps change, so if a
 * sibling effect's reset branch (keyed on `[lessonSlug, ...]` without
 * `milestonesHit`) clobbered its seed in the same commit, the seed effect
 * had already "spent" its one trigger for this lessonSlug and would never
 * fire again — permanently starving every later tick. A single function
 * called fresh every commit has no such per-branch memoization: reset and
 * seed are both re-evaluated from current inputs on every call, so there is
 * no "later" for the seed to be starved from.
 *
 * Order still matters WITHIN one call: reset must be applied before the seed
 * check runs, so a lessonSlug change that lands in the same commit as
 * already-available `milestonesHit` (realistic — `useVideoProgress` has
 * `staleTime: 30_000`, so revisiting a lesson within 30s resolves
 * synchronously) is seeded for the NEW lesson in that same call, not the
 * stale previous one.
 */
export function computeMilestoneTick(
  prev: MilestoneReporterState,
  input: MilestoneTickInput,
): MilestoneTickResult {
  let state = prev;

  // Reset — a new lesson always starts from a clean slate. Must run BEFORE
  // the seed check below: a lessonSlug switch can land in the same call as
  // already-available `milestonesHit` for the new lesson (see doc comment),
  // and resetting first ensures the seed check that follows is evaluated
  // against the NEW lesson's (just-cleared) state, not the old one's.
  if (state.lessonSlug !== input.lessonSlug) {
    state = {
      lessonSlug: input.lessonSlug,
      reported: new Set(),
      seededFor: null,
      lastTime: 0,
      reconciled: false,
    };
  }

  // Seed — from the server's existing milestones, before any tick logic can
  // run. `input.milestonesHit` must never reflect a *different* lesson's
  // cache: useVideoProgress has no `placeholderData`/`keepPreviousData`, so
  // `data` is undefined across a query-key change until the NEW key
  // resolves. Do not add either option to that hook — it would make stale
  // seeding here possible.
  if (
    input.lessonSlug &&
    input.milestonesHit &&
    state.seededFor !== input.lessonSlug
  ) {
    state = {
      ...state,
      reported: new Set(input.milestonesHit),
      seededFor: input.lessonSlug,
    };
  }

  const noop: MilestoneTickResult = {
    state,
    crossed: [],
    shouldReconcile: false,
  };

  if (
    !input.lessonSlug ||
    !Number.isFinite(input.duration) ||
    input.duration <= 0
  ) {
    // Duration not ready yet. `lastTime` is intentionally left un-advanced
    // here (unlike the seek path below) — once duration becomes valid, at
    // worst one tick is treated as a spurious seek and deferred, not lost.
    return noop;
  }
  if (state.seededFor !== input.lessonSlug) return noop;

  const prevTime = state.lastTime;
  const advance = input.currentTime - prevTime;
  state = { ...state, lastTime: input.currentTime };
  if (advance < 0 || advance > SEEK_THRESHOLD_SECONDS) {
    return { state, crossed: [], shouldReconcile: false };
  }

  const crossed = crossedMilestones(
    (prevTime / input.duration) * 100,
    (input.currentTime / input.duration) * 100,
    state.reported,
  );
  if (crossed.length > 0) {
    const reported = new Set(state.reported);
    for (const milestone of crossed) reported.add(milestone);
    state = { ...state, reported };
  }

  const shouldReconcile = !state.reconciled && isVideoWatched(state.reported);
  if (shouldReconcile) state = { ...state, reconciled: true };

  return { state, crossed, shouldReconcile };
}
