import { describe, expect, it } from 'vitest';
import {
  computeMilestoneTick,
  initialMilestoneReporterState,
  type MilestoneReporterState,
} from '../milestone-tick';

const DURATION = 100; // seconds — chosen so percent === currentTime, for readability

describe('computeMilestoneTick', () => {
  it('reports nothing before the seed lands (milestonesHit undefined)', () => {
    const result = computeMilestoneTick(initialMilestoneReporterState, {
      lessonSlug: 'v1',
      currentTime: 12,
      duration: DURATION,
      milestonesHit: undefined,
    });

    expect(result.crossed).toEqual([]);
    expect(result.state.seededFor).toBeNull();
  });

  it('reports nothing for a forward seek larger than SEEK_THRESHOLD_SECONDS', () => {
    let state = initialMilestoneReporterState;
    ({ state } = computeMilestoneTick(state, {
      lessonSlug: 'v1',
      currentTime: 0,
      duration: DURATION,
      milestonesHit: [],
    }));

    const result = computeMilestoneTick(state, {
      lessonSlug: 'v1',
      currentTime: 95,
      duration: DURATION,
      milestonesHit: [],
    });

    expect(result.crossed).toEqual([]);
  });

  it('reports nothing for a backwards jump, and still advances lastTime', () => {
    let state = initialMilestoneReporterState;
    ({ state } = computeMilestoneTick(state, {
      lessonSlug: 'v1',
      currentTime: 20,
      duration: DURATION,
      milestonesHit: [],
    }));

    const result = computeMilestoneTick(state, {
      lessonSlug: 'v1',
      currentTime: 5,
      duration: DURATION,
      milestonesHit: [],
    });

    expect(result.crossed).toEqual([]);
    // lastTime must move even on a seek, or the next tick compares against a
    // stale position and reports a whole skipped range.
    expect(result.state.lastTime).toBe(5);
  });

  it('reports exactly the milestone crossed by normal playback, once', () => {
    let state = initialMilestoneReporterState;
    const allCrossed: number[] = [];
    for (const t of [0, 2, 4, 6, 8, 10, 11]) {
      const result = computeMilestoneTick(state, {
        lessonSlug: 'v1',
        currentTime: t,
        duration: DURATION,
        milestonesHit: [],
      });
      state = result.state;
      allCrossed.push(...result.crossed);
    }

    expect(allCrossed).toEqual([10]);
  });

  it('reconciles exactly once when coverage completes, not on later ticks', () => {
    let state: MilestoneReporterState = {
      ...initialMilestoneReporterState,
      lessonSlug: 'v1',
      seededFor: 'v1',
      // Every watched-milestone except the last (95) already reported.
      reported: new Set([
        10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
      ]),
      lastTime: 93,
    };

    const completing = computeMilestoneTick(state, {
      lessonSlug: 'v1',
      currentTime: 95,
      duration: DURATION,
      milestonesHit: [],
    });
    expect(completing.shouldReconcile).toBe(true);
    state = completing.state;

    const after = computeMilestoneTick(state, {
      lessonSlug: 'v1',
      currentTime: 97,
      duration: DURATION,
      milestonesHit: [],
    });
    expect(after.shouldReconcile).toBe(false);
  });

  // Finding 1 regression. The pre-fix hook split this decision across two
  // `useEffect`s with different dependency arrays: a seed effect keyed on
  // `[lessonSlug, milestonesHit]` and a reset+tick effect keyed on
  // `[currentTime, duration, lessonSlug, queryClient]` (no `milestonesHit`).
  // When `useVideoProgress` already had cache-fresh data for the *new*
  // lessonSlug at the moment the prop changed (staleTime: 30_000 makes this
  // the common case revisiting a lesson), both effects ran in the same
  // commit: the seed effect (declared first) seeded the new lesson's
  // milestones, then the reset effect (declared second, still comparing
  // against the OLD lessonSlug) wiped that seed back to null. Because the
  // seed effect's own deps hadn't changed again, it never re-ran —
  // `seededFor` stayed permanently mismatched and no milestone was ever
  // reported for that playback session.
  //
  // Collapsing both effects into one function called fresh every commit
  // removes the "never re-ran" half of that bug structurally (there is no
  // separate dependency array to starve). What remains, and what this test
  // asserts, is a narrower ordering requirement: reset must be applied
  // BEFORE the seed check within a single call, so a lessonSlug switch that
  // lands in the same call as already-available `milestonesHit` seeds the
  // NEW lesson in that same call rather than being immediately reset away.
  it('seeds the NEW lesson within the same call that switches lessonSlug with already-available milestonesHit', () => {
    const midLessonA: MilestoneReporterState = {
      lessonSlug: 'lesson-a',
      reported: new Set([10, 15, 20]),
      seededFor: 'lesson-a',
      lastTime: 20,
      reconciled: false,
    };

    // Navigate to lesson-b on the same player instance (no `key` change)
    // with its progress query already resolved — the exact commit that raced.
    const afterSwitch = computeMilestoneTick(midLessonA, {
      lessonSlug: 'lesson-b',
      currentTime: 0,
      duration: DURATION,
      milestonesHit: [],
    });

    expect(afterSwitch.state.lessonSlug).toBe('lesson-b');
    expect(afterSwitch.state.seededFor).toBe('lesson-b');
    expect(afterSwitch.state.reported).toEqual(new Set());

    // And playback for lesson-b now reports normally, instead of being
    // blocked forever by a seededFor that could never match again.
    let state = afterSwitch.state;
    const crossedForB: number[] = [];
    for (const t of [2, 4, 6, 8, 10]) {
      const result = computeMilestoneTick(state, {
        lessonSlug: 'lesson-b',
        currentTime: t,
        duration: DURATION,
        milestonesHit: [],
      });
      state = result.state;
      crossedForB.push(...result.crossed);
    }
    expect(crossedForB).toContain(10);
  });

  it('resets its cursor when the lesson changes, not merely the video', () => {
    const seeded = computeMilestoneTick(initialMilestoneReporterState, {
      lessonSlug: 'a',
      currentTime: 0,
      duration: 100,
      milestonesHit: [10],
    }).state;
    const next = computeMilestoneTick(seeded, {
      lessonSlug: 'b',
      currentTime: 0,
      duration: 100,
      milestonesHit: undefined,
    });
    expect(next.state.lessonSlug).toBe('b');
    expect(next.state.reported.size).toBe(0);
  });
});
