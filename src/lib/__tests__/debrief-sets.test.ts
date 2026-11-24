import { describe, expect, it } from 'vitest';
import {
  answerVerdict,
  completedSetAverages,
  DEBRIEF_SET_PASS_SCORE,
  DEBRIEF_SET_SIZE,
  setAverage,
  setsProgress,
  splitIntoSets,
} from '#/lib/debrief-sets';
import { debriefJudge } from '#/lib/lesson-score';

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
  it('is the unrounded mean: rounding is for display only', () => {
    expect(setAverage([100, 80, 50, 70])).toBe(75);
    expect(setAverage([75, 74, 74, 74])).toBe(74.25);
    expect(setAverage([75, 75, 74, 74])).toBe(74.5);
  });
  it('is 0 for no scores', () => {
    expect(setAverage([])).toBe(0);
  });
});

const judge = (avg: number) => avg >= 60;
const set1 = (v: number) => ({ q1: v, q2: v, q3: v, q4: v });
const set2 = (v: number) => ({ q5: v, q6: v, q7: v, q8: v });

describe('completedSetAverages', () => {
  it('lists fully answered sets in order and ignores a half-answered one', () => {
    expect(
      completedSetAverages(TWO_SETS, scores({ ...set1(70), q5: 100, q6: 100 })),
    ).toEqual([70]);
  });
  it('does not stop at a passing set', () => {
    expect(
      completedSetAverages(TWO_SETS, scores({ ...set1(90), ...set2(10) })),
    ).toEqual([90, 10]);
  });
});

describe('setsProgress', () => {
  const run = (
    sets: readonly (readonly string[])[],
    s: Record<string, number>,
    improveAccepted = false,
  ) => setsProgress(sets, scores(s), judge, { improveAccepted });

  it('shows only set 1 before it is complete', () => {
    expect(run(TWO_SETS, { q1: 100, q2: 100, q3: 100 })).toEqual({
      completed: [],
      reached: 1,
      passed: false,
      best: null,
      offer: false,
      over: false,
    });
  });

  it('a passed set 1 offers set 2 and stays on set 1', () => {
    const p = run(TWO_SETS, set1(70));
    expect(p.completed).toEqual([{ set: 1, average: 70, passed: true }]);
    expect(p).toMatchObject({
      offer: true,
      reached: 1,
      over: false,
      passed: true,
      best: 70,
    });
  });

  it('accepting the offer opens set 2', () => {
    const p = run(TWO_SETS, set1(70), true);
    expect(p).toMatchObject({ reached: 2, offer: false, over: false });
  });

  it('a lower set 2 is judged on the better set so far', () => {
    const p = run(TWO_SETS, { ...set1(70), ...set2(40) }, true);
    expect(p.completed[1]).toEqual({ set: 2, average: 40, passed: true });
    expect(p).toMatchObject({ best: 70, over: true, passed: true });
  });

  it('a missed set 1 opens set 2 with no offer', () => {
    const p = run(TWO_SETS, set1(50));
    expect(p).toMatchObject({ reached: 2, offer: false, over: false });
  });

  it('a missed set 2 after a missed set 1 is over, not passed', () => {
    const p = run(TWO_SETS, { ...set1(50), ...set2(55) });
    expect(p).toMatchObject({ passed: false, over: true, best: 55 });
  });

  it('a set 2 that passes after a missed set 1 passes', () => {
    const p = run(TWO_SETS, { ...set1(50), ...set2(65) });
    expect(p.completed.at(-1)).toEqual({ set: 2, average: 65, passed: true });
    expect(p).toMatchObject({ passed: true, over: true, best: 65 });
  });

  it('a partly answered set 2 is not judged yet', () => {
    const p = run(TWO_SETS, { ...set1(50), q5: 100 });
    expect(p.completed).toHaveLength(1);
    expect(p).toMatchObject({ reached: 2, over: false });
  });

  it('a lone set that passed offers nothing and is over', () => {
    const p = run([['q1', 'q2', 'q3']], { q1: 90, q2: 90, q3: 90 });
    expect(p).toMatchObject({ offer: false, over: true, reached: 1 });
  });

  it('a lone set that missed is over', () => {
    const p = run([['q1', 'q2', 'q3']], { q1: 10, q2: 10, q3: 10 });
    expect(p).toMatchObject({ passed: false, over: true, reached: 1 });
  });

  it('judges the unrounded average: with a full quiz and pass mark 65, a set averaging 39.5 does not pass', () => {
    const seen: number[] = [];
    const real = debriefJudge({ quiz: { correct: 5, total: 5 } }, 65);
    const p = setsProgress(
      TWO_SETS,
      scores({ q1: 40, q2: 40, q3: 39, q4: 39 }),
      (avg) => {
        seen.push(avg);
        return real(avg);
      },
      { improveAccepted: false },
    );
    expect(seen).toContain(39.5);
    expect(p.completed[0]).toEqual({ set: 1, average: 39.5, passed: false });
    expect(p).toMatchObject({ passed: false, offer: false, reached: 2 });
  });

  it('a smaller second set is judged on what it asks', () => {
    const p = run([['q1', 'q2', 'q3', 'q4'], ['q5']], {
      ...set1(0),
      q5: 80,
    });
    expect(p.completed.at(-1)).toEqual({ set: 2, average: 80, passed: true });
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
