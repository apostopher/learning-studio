import { describe, expect, it } from 'vitest';
import { formatDebriefTime } from '#/lib/format-debrief-time';

/**
 * The zone is passed explicitly — never via `process.env.TZ`, which would leak
 * into every other test in the worker. Auckland is UTC+13 in late October
 * (NZDT), far enough from UTC that a formatter ignoring the zone gets the
 * wrong DAY, not just the wrong hour.
 */
const AUCKLAND = 'Pacific/Auckland';

describe('formatDebriefTime', () => {
  it('formats the instant in the given zone, without the year when it is this year', () => {
    expect(
      formatDebriefTime(
        '2026-10-27T23:30:00Z',
        new Date('2026-10-27T12:00:00Z'),
        AUCKLAND,
      ),
    ).toBe('Wed 28 Oct, 12:30 PM');
  });

  it('adds the year when it differs from the current year', () => {
    expect(
      formatDebriefTime(
        '2027-01-01T05:00:00Z',
        new Date('2026-12-30T00:00:00Z'),
        AUCKLAND,
      ),
    ).toBe('Fri 1 Jan 2027, 6:00 PM');
  });

  it("compares years in the pilot's zone, not UTC", () => {
    // `now` is still 2026 in UTC but already 1 Jan 2027 in Auckland, so a
    // 2027 time there is "this year" and carries no year.
    expect(
      formatDebriefTime(
        '2027-01-02T00:00:00Z',
        new Date('2026-12-31T12:00:00Z'),
        AUCKLAND,
      ),
    ).toBe('Sat 2 Jan, 1:00 PM');
  });

  it("defaults to the browser's own zone", () => {
    const iso = '2026-10-27T23:30:00Z';
    const now = new Date('2026-10-27T12:00:00Z');
    expect(formatDebriefTime(iso, now)).toBe(
      formatDebriefTime(
        iso,
        now,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    );
  });
});
