import { describe, expect, it } from 'vitest';
import { milestones, unreportedMilestones } from '#/lib/course-milestones';

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
