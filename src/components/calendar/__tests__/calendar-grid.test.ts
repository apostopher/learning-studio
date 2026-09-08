import { differenceInCalendarDays } from 'date-fns';
import { describe, expect, it } from 'vitest';
import {
  buildCalendarGrid,
  calendarWeekdayLabels,
  calendarWindowStart,
  formatCalendarRange,
  shiftCalendarWindow,
} from '../calendar-grid';

/** 7 Sep 2026 is a Monday; 1 Sep 2026 is a Tuesday. */
const MONDAY = new Date(2026, 8, 7);

const flatten = (weeks: ReturnType<typeof buildCalendarGrid>) =>
  weeks.flatMap((week) => week.days);

describe('buildCalendarGrid', () => {
  it('builds `weeks` rows of seven days', () => {
    const weeks = buildCalendarGrid({ weekStart: MONDAY, weeks: 10 });

    expect(weeks).toHaveLength(10);
    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
  });

  it('starts on the week start of the week containing `weekStart`', () => {
    // A Thursday mid-week — the grid must still open on that week's Monday
    // rather than starting the row on a Thursday.
    const weeks = buildCalendarGrid({
      weekStart: new Date(2026, 8, 10),
      weeks: 2,
    });

    expect(weeks[0].days[0].date.getDate()).toBe(7);
    expect(weeks[0].days[0].date.getMonth()).toBe(8);
  });

  it('flags Saturday and Sunday as the weekend on a Monday-first grid', () => {
    const [week] = buildCalendarGrid({ weekStart: MONDAY, weeks: 1 });

    expect(week.days.map((day) => day.isWeekend)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('moves the weekend columns when the week starts on Sunday', () => {
    const [week] = buildCalendarGrid({
      weekStart: MONDAY,
      weeks: 1,
      weekStartsOn: 0,
    });

    expect(week.days[0].date.getDate()).toBe(6); // Sunday 6 Sep
    expect(week.days.map((day) => day.isWeekend)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('marks exactly the day matching `today`', () => {
    const days = flatten(
      buildCalendarGrid({
        weekStart: MONDAY,
        weeks: 4,
        // Late in the day, to prove the comparison is by calendar day and not
        // by timestamp equality.
        today: new Date(2026, 8, 9, 23, 30),
      }),
    );

    const marked = days.filter((day) => day.isToday);
    expect(marked).toHaveLength(1);
    expect(marked[0].key).toBe('2026-09-09');
  });

  it('marks no day as today when `today` falls outside the window', () => {
    const days = flatten(
      buildCalendarGrid({
        weekStart: MONDAY,
        weeks: 2,
        today: new Date(2025, 0, 1),
      }),
    );

    expect(days.some((day) => day.isToday)).toBe(false);
  });

  it('labels the first of each month and nothing else', () => {
    const days = flatten(buildCalendarGrid({ weekStart: MONDAY, weeks: 10 }));

    const labelled = days.filter((day) => day.isFirstOfMonth);
    expect(labelled.map((day) => day.key)).toEqual([
      '2026-10-01',
      '2026-11-01',
    ]);
    expect(labelled.map((day) => day.monthLabel)).toEqual(['Oct', 'Nov']);
    expect(days.filter((day) => day.monthLabel !== null)).toHaveLength(2);
  });

  it('carries the grid position of each day', () => {
    const weeks = buildCalendarGrid({ weekStart: MONDAY, weeks: 3 });

    expect(weeks[2].days[4]).toMatchObject({
      weekIndex: 2,
      dayIndex: 4,
      dayOfMonth: 25,
    });
  });

  // A window built by adding 24h at a time loses or repeats a day across a
  // clock change. Asserted for both hemispheres' transition months, and
  // written so it holds in whatever zone the test runner is in.
  it.each([
    ['a spring transition', new Date(2026, 2, 2)],
    ['an autumn transition', new Date(2026, 9, 5)],
  ])('spans %s without skipping or repeating a day', (_label, weekStart) => {
    const days = flatten(buildCalendarGrid({ weekStart, weeks: 10 }));

    expect(new Set(days.map((day) => day.key)).size).toBe(70);
    for (let i = 1; i < days.length; i++) {
      expect(differenceInCalendarDays(days[i].date, days[i - 1].date)).toBe(1);
    }
  });
});

describe('calendarWindowStart', () => {
  it('opens on the week start of the reference week', () => {
    expect(calendarWindowStart(new Date(2026, 8, 10))).toEqual(
      new Date(2026, 8, 7),
    );
  });

  it('backs up whole weeks so a run already under way stays visible', () => {
    expect(
      calendarWindowStart(new Date(2026, 8, 10), { weeksBefore: 2 }),
    ).toEqual(new Date(2026, 7, 24));
  });
});

describe('shiftCalendarWindow', () => {
  it('steps forward and back in whole weeks', () => {
    expect(shiftCalendarWindow(MONDAY, 4)).toEqual(new Date(2026, 9, 5));
    expect(shiftCalendarWindow(MONDAY, -4)).toEqual(new Date(2026, 7, 10));
  });

  it('normalises an off-week date before stepping', () => {
    expect(shiftCalendarWindow(new Date(2026, 8, 10), 1)).toEqual(
      new Date(2026, 8, 14),
    );
  });
});

describe('formatCalendarRange', () => {
  it('names the first and last day on screen', () => {
    expect(formatCalendarRange(MONDAY, 10)).toBe('7 Sep – 15 Nov 2026');
  });

  it('carries the opening year when the window straddles new year', () => {
    expect(formatCalendarRange(new Date(2026, 11, 7), 10)).toBe(
      '7 Dec 2026 – 14 Feb 2027',
    );
  });
});

describe('calendarWeekdayLabels', () => {
  it('labels a Monday-first week with the weekend at the end', () => {
    expect(calendarWeekdayLabels().map((d) => d.label)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(calendarWeekdayLabels().map((d) => d.isWeekend)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('rotates for a Sunday-first week', () => {
    expect(calendarWeekdayLabels(0).map((d) => d.label)).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
  });
});
