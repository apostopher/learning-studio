import { describe, expect, it } from 'vitest';
import { debriefJudge, formatScore, setScore } from '#/lib/lesson-score';

const quiz = (correct: number, total = 5) => ({ quiz: { correct, total } });

describe('setScore', () => {
  it('doc example, set 1: (64 + 55 + 45 + 42) / 4 + 4 right answers = 71.5, a fail at 85', () => {
    const s = setScore(quiz(4), 85, (64 + 55 + 45 + 42) / 4);
    expect(s.total).toBe(71.5);
    expect(s.passed).toBe(false);
    expect(s.parts.map((p) => [p.part, p.points])).toEqual([
      ['quiz', 20],
      ['debrief', 51.5],
    ]);
  });

  it('doc example, set 2: (64 + 83 + 40 + 55) / 4 + the corrected quiz = 85.5, a pass', () => {
    const s = setScore(quiz(5), 85, (64 + 83 + 40 + 55) / 4);
    expect(s.total).toBe(85.5);
    expect(s.passed).toBe(true);
  });

  it('the same set 2 with the quiz left at 4 of 5 is 80.5, a fail', () => {
    const s = setScore(quiz(4), 85, 60.5);
    expect(s.total).toBe(80.5);
    expect(s.passed).toBe(false);
  });

  it('each right answer is worth 5 whatever the quiz length', () => {
    expect(setScore(quiz(2, 3), 85, 60).total).toBe(70);
    expect(setScore(quiz(2, 10), 85, 60).total).toBe(70);
  });

  it.each([
    [5, 85],
    [4, 80],
    [3, 75],
    [1, 65],
  ])('a quiz of %i questions needs %i in a course marked 85', (total, mark) => {
    expect(setScore(quiz(0, total), 85, 50).passMark).toBe(mark);
  });

  it('a lesson with no quiz is the average alone, against 60 in a course marked 85', () => {
    const s = setScore({ quiz: null }, 85, 59.96);
    expect(s.parts.map((p) => p.part)).toEqual(['debrief']);
    expect(s).toMatchObject({ total: 59.96, passMark: 60, passed: false });
    expect(setScore({ quiz: null }, 85, 60).passed).toBe(true);
  });

  it('a full quiz leaves the same debrief average to reach, whatever its length', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const judge = debriefJudge(quiz(n, n), 85);
      expect([judge(60), judge(59.75)]).toEqual([true, false]);
    }
  });

  it('the allowance follows the course mark, and never goes below 0', () => {
    expect(setScore({ quiz: null }, 70, 50).passMark).toBe(45);
    expect(setScore({ quiz: null }, 20, 0).passMark).toBe(0);
  });

  it('a quiz longer than five never raises the mark', () => {
    expect(setScore(quiz(0, 8), 85, 50).passMark).toBe(85);
  });

  it('reaching the mark exactly passes', () => {
    expect(debriefJudge(quiz(5), 85)(60)).toBe(true);
    expect(debriefJudge(quiz(5), 85)(59.75)).toBe(false);
  });
});

describe('formatScore', () => {
  it('one decimal, whole numbers without .0', () => {
    expect(formatScore(82.875)).toBe('82.9');
    expect(formatScore(50)).toBe('50');
    expect(formatScore(85.5)).toBe('85.5');
  });
});
