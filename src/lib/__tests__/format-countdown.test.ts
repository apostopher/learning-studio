import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  nextTickDelay,
  reopenRetryDelay,
} from '#/lib/format-countdown';

describe('formatCountdown', () => {
  it.each([
    [20_400_000, '5 h 40 min'], // the brief's example
    [2_399_000, '40 min'], // 39 min 59 s rounds UP — never less than remains
    [45_000, '45 s'],
    [0, '0 s'],
    [-5_000, '0 s'],
    [21_600_000, '6 h'], // the whole retake wait, no "0 min"
    [3_600_001, '1 h 1 min'],
    [60_000, '1 min'],
    [59_500, '1 min'], // 59.5 s is 60 s rounded up: a minute, not "60 s"
    [59_000, '59 s'],
    [400, '1 s'],
  ])('%i ms reads "%s"', (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected);
  });
});

describe('nextTickDelay', () => {
  it('waits for the next minute boundary while minutes are shown', () => {
    // 5 h 40 min 0.5 s shows "5 h 41 min"; it becomes "5 h 40 min" in 500 ms.
    expect(nextTickDelay(20_400_500)).toBe(500);
    // On a boundary: the next change is a whole minute away.
    expect(nextTickDelay(20_400_000)).toBe(60_000);
  });

  it('never ticks less often than once a minute', () => {
    for (const ms of [61_000, 90_000, 3_600_000, 21_600_000]) {
      expect(nextTickDelay(ms)).toBeLessThanOrEqual(60_000);
      expect(nextTickDelay(ms)).toBeGreaterThan(0);
    }
  });

  it('switches to seconds exactly when the display does', () => {
    // 59.5 s shows "1 min"; at 59 s it must read "59 s".
    expect(nextTickDelay(59_500)).toBe(500);
    expect(nextTickDelay(60_000)).toBe(1_000);
  });

  it('ticks every second under a minute', () => {
    expect(nextTickDelay(45_000)).toBe(1_000);
    expect(nextTickDelay(44_300)).toBe(300);
  });
});

describe('reopenRetryDelay', () => {
  it('backs off from 5 s, doubling, capped at a minute', () => {
    expect([0, 1, 2, 3, 4, 10].map(reopenRetryDelay)).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000,
    ]);
  });
});
