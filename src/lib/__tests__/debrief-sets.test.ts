import { describe, expect, it } from 'vitest';
import { debriefSetsProgress } from '#/lib/debrief-sets';

/** A full prepared debrief: two sets of three essays. */
const SIX = 6;

describe('debriefSetsProgress', () => {
  it('asks the first set of three before anything is answered', () => {
    expect(debriefSetsProgress([], SIX)).toEqual({
      asked: 3,
      complete: false,
      secondSet: false,
      score: 0,
    });
  });

  it('passes on the first set alone when its average reaches 75', () => {
    expect(debriefSetsProgress([100, 75, 50], SIX)).toEqual({
      asked: 3,
      complete: true,
      secondSet: false,
      score: 75,
    });
  });

  it('offers the second set when the first averages under 75', () => {
    expect(debriefSetsProgress([80, 70, 60], SIX)).toEqual({
      asked: 6,
      complete: false,
      secondSet: true,
      score: 70,
    });
  });

  it('judges all six together once the second set is answered', () => {
    // 60 on set 1, 90 on set 2: the average of all six is 75, a pass.
    expect(debriefSetsProgress([60, 60, 60, 90, 90, 90], SIX)).toEqual({
      asked: 6,
      complete: true,
      secondSet: true,
      score: 75,
    });
    expect(debriefSetsProgress([60, 60, 60, 80, 80, 80], SIX).score).toBe(70);
  });

  it('stops at what the test holds when it is shorter than two sets', () => {
    expect(debriefSetsProgress([10, 10, 10], 3)).toMatchObject({
      asked: 3,
      complete: true,
      secondSet: false,
    });
  });
});
