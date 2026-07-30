import { describe, expect, it } from 'vitest';
import {
  crossedMilestones,
  isVideoWatched,
  milestones,
  unreportedMilestones,
  watchedMilestones,
} from '#/lib/course-milestones';

describe('milestones', () => {
  it('is the full 5% list from 10 to 100 (19 entries)', () => {
    expect(milestones).toEqual([
      10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
      100,
    ]);
  });
});

describe('unreportedMilestones', () => {
  it('returns all milestones at or below percent when none reported', () => {
    expect(unreportedMilestones(52, new Set())).toEqual([
      10, 15, 20, 25, 30, 35, 40, 45, 50,
    ]);
  });

  it('excludes already-reported milestones', () => {
    const reported = new Set([10, 15, 20, 25, 30, 35, 40, 45, 50]);
    expect(unreportedMilestones(52, reported)).toEqual([]);
    expect(unreportedMilestones(58, reported)).toEqual([55]);
  });

  it('returns every milestone at 100%', () => {
    expect(unreportedMilestones(100, new Set())).toEqual(milestones);
  });

  it('returns nothing below the first milestone or for invalid input', () => {
    expect(unreportedMilestones(9, new Set())).toEqual([]);
    expect(unreportedMilestones(0, new Set())).toEqual([]);
    expect(unreportedMilestones(Number.NaN, new Set())).toEqual([]);
  });
});

describe('watchedMilestones / isVideoWatched', () => {
  it('is every milestone except the final 100', () => {
    expect(watchedMilestones).toEqual([
      10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
    ]);
    expect(watchedMilestones).not.toContain(100);
  });

  it('counts as watched when every milestone up to 95 is hit (100 optional)', () => {
    expect(isVideoWatched(new Set(watchedMilestones))).toBe(true);
    // 100 present too — still watched.
    expect(isVideoWatched(new Set(milestones))).toBe(true);
  });

  it('is not watched when an interior milestone is skipped', () => {
    const skipped = new Set(watchedMilestones.filter((m) => m !== 50));
    expect(isVideoWatched(skipped)).toBe(false);
  });

  it('is not watched for someone who only reached the end (skipped to it)', () => {
    expect(isVideoWatched(new Set([100]))).toBe(false);
  });
});

describe('crossedMilestones', () => {
  it('reports only milestones crossed by this advance', () => {
    expect(crossedMilestones(8, 12, new Set())).toEqual([10]);
  });

  it('reports nothing when no milestone lies in the interval', () => {
    expect(crossedMilestones(11, 12, new Set())).toEqual([]);
  });

  it('does NOT report every milestone below the current position', () => {
    // This is the whole point. The old unreportedMilestones(95, new Set())
    // returned all 19 milestones, so one scrubber drag or a press of End
    // recorded a full watch and unlocked the material instantly.
    expect(crossedMilestones(94, 95, new Set())).toEqual([95]);
  });

  it('skips milestones already reported', () => {
    expect(crossedMilestones(8, 22, new Set([10, 15]))).toEqual([20]);
  });

  it('reports a contiguous run when a tick spans several milestones', () => {
    expect(crossedMilestones(8, 22, new Set())).toEqual([10, 15, 20]);
  });

  it('returns nothing for a backwards interval', () => {
    expect(crossedMilestones(50, 20, new Set())).toEqual([]);
  });

  it('returns nothing for non-finite input', () => {
    expect(crossedMilestones(Number.NaN, 50, new Set())).toEqual([]);
    expect(crossedMilestones(0, Number.POSITIVE_INFINITY, new Set())).toEqual(
      [],
    );
  });

  it('supports out-of-order coverage across sessions', () => {
    // Watching the last three minutes, then the first three, must add up.
    const reported = new Set<number>();
    for (const m of crossedMilestones(84, 100, reported)) reported.add(m);
    for (const m of crossedMilestones(0, 83, reported)) reported.add(m);
    expect(isVideoWatched(reported)).toBe(true);
  });
});
