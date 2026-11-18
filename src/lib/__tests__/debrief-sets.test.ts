import { describe, expect, it } from 'vitest';
import {
  answerVerdict,
  DEBRIEF_SET_PASS_SCORE,
  DEBRIEF_SET_SIZE,
  setAverage,
  setsProgress,
  splitIntoSets,
} from '#/lib/debrief-sets';

const scores = (entries: Record<string, number>) =>
  new Map(Object.entries(entries));

const TWO_SETS = [
  ['q1', 'q2', 'q3', 'q4'],
  ['q5', 'q6', 'q7', 'q8'],
];

describe('constants', () => {
  it('asks sets of four and passes at 75', () => {
    expect(DEBRIEF_SET_SIZE).toBe(4);
    expect(DEBRIEF_SET_PASS_SCORE).toBe(75);
  });
});

describe('splitIntoSets', () => {
  it('cuts eight into two sets of four, in order', () => {
    expect(
      splitIntoSets(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8']),
    ).toEqual(TWO_SETS);
  });
  it('gives a short lesson a smaller second set', () => {
    expect(splitIntoSets(['q1', 'q2', 'q3', 'q4', 'q5'])).toEqual([
      ['q1', 'q2', 'q3', 'q4'],
      ['q5'],
    ]);
  });
  it('gives a lesson of four or fewer one set', () => {
    expect(splitIntoSets(['q1', 'q2', 'q3'])).toEqual([['q1', 'q2', 'q3']]);
    expect(splitIntoSets([])).toEqual([]);
  });
});

describe('setAverage', () => {
  it('is the rounded mean', () => {
    expect(setAverage([100, 80, 50, 70])).toBe(75);
    expect(setAverage([75, 74, 74, 74])).toBe(74); // 74.25
    expect(setAverage([75, 75, 74, 74])).toBe(75); // 74.5 rounds up
  });
  it('is 0 for no scores', () => {
    expect(setAverage([])).toBe(0);
  });
});

describe('setsProgress', () => {
  it('shows only set 1 before it is complete', () => {
    expect(
      setsProgress(TWO_SETS, scores({ q1: 100, q2: 100, q3: 100 })),
    ).toEqual({ completed: [], reached: 1, passed: false, over: false });
  });

  it('a set 1 averaging 75 passes and ends the attempt; set 2 is never reached', () => {
    expect(
      setsProgress(TWO_SETS, scores({ q1: 100, q2: 80, q3: 50, q4: 70 })),
    ).toEqual({
      completed: [{ set: 1, average: 75, passed: true }],
      reached: 1,
      passed: true,
      over: true,
    });
  });

  it('a missed set 1 reaches set 2', () => {
    expect(
      setsProgress(TWO_SETS, scores({ q1: 50, q2: 50, q3: 80, q4: 90 })),
    ).toEqual({
      completed: [{ set: 1, average: 68, passed: false }],
      reached: 2,
      passed: false,
      over: false,
    });
  });

  it('judges set 2 on its own: a pass there passes', () => {
    const p = setsProgress(
      TWO_SETS,
      scores({
        q1: 0,
        q2: 0,
        q3: 0,
        q4: 0,
        q5: 80,
        q6: 80,
        q7: 70,
        q8: 70,
      }),
    );
    expect(p.completed).toEqual([
      { set: 1, average: 0, passed: false },
      { set: 2, average: 75, passed: true },
    ]);
    expect(p.passed).toBe(true);
    expect(p.over).toBe(true);
  });

  it('a missed last set is over, not passed', () => {
    const p = setsProgress(
      TWO_SETS,
      scores({
        q1: 50,
        q2: 50,
        q3: 50,
        q4: 50,
        q5: 70,
        q6: 70,
        q7: 70,
        q8: 70,
      }),
    );
    expect(p).toEqual({
      completed: [
        { set: 1, average: 50, passed: false },
        { set: 2, average: 70, passed: false },
      ],
      reached: 2,
      passed: false,
      over: true,
    });
  });

  it('a partly answered set 2 is not judged yet', () => {
    const p = setsProgress(
      TWO_SETS,
      scores({ q1: 50, q2: 50, q3: 50, q4: 50, q5: 100 }),
    );
    expect(p.completed).toHaveLength(1);
    expect(p.reached).toBe(2);
    expect(p.over).toBe(false);
  });

  it('a one-set (pre-sets, or short lesson) attempt missed is over after that set', () => {
    expect(
      setsProgress([['q1', 'q2', 'q3']], scores({ q1: 10, q2: 10, q3: 10 })),
    ).toEqual({
      completed: [{ set: 1, average: 10, passed: false }],
      reached: 1,
      passed: false,
      over: true,
    });
  });

  it('a smaller second set is judged on what it asks', () => {
    const p = setsProgress(
      [['q1', 'q2', 'q3', 'q4'], ['q5']],
      scores({ q1: 0, q2: 0, q3: 0, q4: 0, q5: 80 }),
    );
    expect(p.completed.at(-1)).toEqual({ set: 2, average: 80, passed: true });
    expect(p.passed).toBe(true);
  });
});

describe('answerVerdict', () => {
  it('reads Strong from 85, Mostly there from 75, Partly from 40, else Missed', () => {
    expect(answerVerdict(100)).toBe('Strong');
    expect(answerVerdict(85)).toBe('Strong');
    expect(answerVerdict(84)).toBe('Mostly there');
    expect(answerVerdict(75)).toBe('Mostly there');
    expect(answerVerdict(74)).toBe('Partly');
    expect(answerVerdict(40)).toBe('Partly');
    expect(answerVerdict(39)).toBe('Missed');
    expect(answerVerdict(0)).toBe('Missed');
  });
});
