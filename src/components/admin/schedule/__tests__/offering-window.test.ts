import { describe, expect, it } from 'vitest';
import {
  endDateFromWindow,
  formatWindowSummary,
  parseDayKey,
  windowDaysBetween,
} from '../offering-window';

describe('parseDayKey', () => {
  it('reads a date in local time, not UTC', () => {
    const date = parseDayKey('2026-09-07');
    // Would be the 6th for anyone west of Greenwich if parsed as an instant.
    expect(date?.getDate()).toBe(7);
    expect(date?.getMonth()).toBe(8);
    expect(date?.getFullYear()).toBe(2026);
  });

  it('refuses a malformed key', () => {
    expect(parseDayKey('2026-9-7')).toBeNull();
    expect(parseDayKey('not-a-date')).toBeNull();
    expect(parseDayKey('')).toBeNull();
  });

  // `new Date(2026, 1, 31)` silently rolls over to 3 March.
  it('refuses a well-shaped date that does not exist', () => {
    expect(parseDayKey('2026-02-31')).toBeNull();
    expect(parseDayKey('2026-13-01')).toBeNull();
  });

  it('accepts a real leap day', () => {
    expect(parseDayKey('2028-02-29')?.getDate()).toBe(29);
  });
});

describe('windowDaysBetween', () => {
  // Both ends included: the student has the start day to work in.
  it('counts a same-day offering as one day', () => {
    expect(windowDaysBetween('2026-09-07', '2026-09-07')).toBe(1);
  });

  it('counts both ends', () => {
    expect(windowDaysBetween('2026-09-07', '2026-09-08')).toBe(2);
    expect(windowDaysBetween('2026-09-07', '2026-09-13')).toBe(7);
  });

  it('matches the mockup: 6 Jul to 16 Oct 2026 is 103 days', () => {
    expect(windowDaysBetween('2026-07-06', '2026-10-16')).toBe(103);
  });

  it('spans a year boundary', () => {
    expect(windowDaysBetween('2026-12-30', '2027-01-02')).toBe(4);
  });

  // Counted in calendar days, so a clock change must not add or drop one.
  it('is unaffected by a daylight-saving change', () => {
    expect(windowDaysBetween('2026-03-27', '2026-04-01')).toBe(6);
    expect(windowDaysBetween('2026-10-24', '2026-10-29')).toBe(6);
  });

  it('refuses an end before the start', () => {
    expect(windowDaysBetween('2026-09-07', '2026-09-06')).toBeNull();
  });

  it('refuses an unusable date', () => {
    expect(windowDaysBetween('', '2026-09-07')).toBeNull();
    expect(windowDaysBetween('2026-09-07', 'nope')).toBeNull();
  });
});

describe('endDateFromWindow', () => {
  // Round-trip: the two directions of the same fact must agree.
  it('is the inverse of windowDaysBetween', () => {
    const endsOn = endDateFromWindow('2026-07-06', 103);
    expect(endsOn).toBe('2026-10-16');
    expect(windowDaysBetween('2026-07-06', endsOn as string)).toBe(103);
  });

  it('counts the start day as day one', () => {
    expect(endDateFromWindow('2026-09-07', 1)).toBe('2026-09-07');
    expect(endDateFromWindow('2026-09-07', 2)).toBe('2026-09-08');
  });

  it('refuses a window of zero or fewer days', () => {
    expect(endDateFromWindow('2026-09-07', 0)).toBeNull();
    expect(endDateFromWindow('2026-09-07', -5)).toBeNull();
  });

  it('refuses a fractional window', () => {
    expect(endDateFromWindow('2026-09-07', 2.5)).toBeNull();
  });
});

describe('formatWindowSummary', () => {
  it('matches the mockup wording', () => {
    expect(formatWindowSummary('2026-07-06', '2026-10-16')).toBe(
      '103 calendar days — 14 weeks and 5 days',
    );
  });

  it('drops the breakdown below a week, where it says nothing new', () => {
    expect(formatWindowSummary('2026-09-07', '2026-09-07')).toBe(
      '1 calendar day',
    );
    expect(formatWindowSummary('2026-09-07', '2026-09-09')).toBe(
      '3 calendar days',
    );
  });

  it('says whole weeks without a dangling "and 0 days"', () => {
    expect(formatWindowSummary('2026-09-07', '2026-09-13')).toBe(
      '7 calendar days — 1 week',
    );
    expect(formatWindowSummary('2026-09-07', '2026-09-20')).toBe(
      '14 calendar days — 2 weeks',
    );
  });

  it('singularises a one-day remainder', () => {
    expect(formatWindowSummary('2026-09-07', '2026-09-14')).toBe(
      '8 calendar days — 1 week and 1 day',
    );
  });

  it('says nothing when the dates are unusable', () => {
    expect(formatWindowSummary('2026-09-07', '2026-09-06')).toBeNull();
    expect(formatWindowSummary('', '')).toBeNull();
  });
});
