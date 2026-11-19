import { describe, expect, it } from 'vitest';
import { formatScore, lessonTotalScore } from '#/lib/lesson-score';

const shape = (s: ReturnType<typeof lessonTotalScore>) =>
  s.parts.map((p) => [p.part, p.weight]);

describe('lessonTotalScore', () => {
  it('doc example, set 1: video 1, quiz 4/5, debrief 51.5 -> 82.9 fails at 85', () => {
    const s = lessonTotalScore({ video: 1, quiz: 0.8, debrief: 0.515 }, 85);
    expect(s.total).toBeCloseTo(82.875, 3);
    expect(s.passMark).toBe(85);
    expect(s.passed).toBe(false);
    expect(shape(s)).toEqual([
      ['video', 50],
      ['quiz', 25],
      ['debrief', 25],
    ]);
  });
  it('doc example, set 2: 60.5 + full quiz -> 90.1 passes', () => {
    const s = lessonTotalScore({ video: 1, quiz: 1, debrief: 0.605 }, 85);
    expect(s.total).toBeCloseTo(90.125, 3);
    expect(s.passed).toBe(true);
  });
  it('no quiz: video 50 + debrief 50', () => {
    const s = lessonTotalScore({ video: 1, quiz: null, debrief: 1 }, 85);
    expect(shape(s)).toEqual([
      ['video', 50],
      ['debrief', 50],
    ]);
  });
  it('no video: quiz 50 + debrief 50', () => {
    const s = lessonTotalScore({ video: null, quiz: 1, debrief: 1 }, 85);
    expect(shape(s)).toEqual([
      ['quiz', 50],
      ['debrief', 50],
    ]);
  });
  it('no debrief: video 50 + quiz 50', () => {
    const s = lessonTotalScore({ video: 1, quiz: 1, debrief: null }, 85);
    expect(shape(s)).toEqual([
      ['video', 50],
      ['quiz', 50],
    ]);
  });
  it('one part: weight 100', () => {
    const s = lessonTotalScore({ video: null, quiz: 0.5, debrief: null }, 85);
    expect(shape(s)).toEqual([['quiz', 100]]);
    expect(s.total).toBe(50);
  });
  it('no parts: auto pass, total 100, parts []', () => {
    const s = lessonTotalScore({ video: null, quiz: null, debrief: null }, 85);
    expect(s).toEqual({ total: 100, passMark: 85, passed: true, parts: [] });
  });
  it('quiz with 3 questions, 2 right: fraction 2/3 weighs its share evenly', () => {
    const s = lessonTotalScore({ video: 1, quiz: 2 / 3, debrief: 1 }, 85);
    expect(s.parts.find((p) => p.part === 'quiz')?.points).toBeCloseTo(
      (25 * 2) / 3,
      6,
    );
  });
  it('compares unrounded: 84.96 does not pass at 85', () => {
    const s = lessonTotalScore({ video: 1, quiz: null, debrief: 0.6992 }, 85);
    expect(s.total).toBeCloseTo(84.96, 2);
    expect(s.passed).toBe(false);
  });
});

describe('formatScore', () => {
  it('one decimal, whole numbers without .0', () => {
    expect(formatScore(82.875)).toBe('82.9');
    expect(formatScore(50)).toBe('50');
    expect(formatScore(85.5)).toBe('85.5');
  });
});
