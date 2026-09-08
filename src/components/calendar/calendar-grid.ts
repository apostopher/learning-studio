// `#/` not `@/` anywhere in this folder: vitest cannot resolve the `@/` alias,
// and these modules are imported directly by their tests. This one has no
// internal imports at all — it is deliberately pure date arithmetic, so the
// grid can be reasoned about and tested without rendering anything.
import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  getDate,
  isSameDay,
  startOfDay,
  startOfWeek,
} from 'date-fns';

/**
 * Which weekday a row begins on, in date-fns' numbering (0 = Sunday).
 *
 * Monday-first is the default because this grid is a work schedule: putting
 * Saturday and Sunday together at the end is what lets a five-day working
 * week read as one block rather than being split across two ends of a row.
 */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 1;

/** One day in the grid, and everything a cell needs to render itself. */
export type CalendarDay = {
  /** Midnight local time, so consumers can compare and store without a shift. */
  date: Date;
  /**
   * `yyyy-MM-dd` in LOCAL time — the React key, and the natural identifier to
   * hang a drop payload on. Deliberately not an ISO instant: `toISOString()`
   * shifts to UTC, which renames the day either side of midnight for most of
   * the world.
   */
  key: string;
  dayOfMonth: number;
  /** `'Oct'` on the 1st of a month, otherwise null. */
  monthLabel: string | null;
  isWeekend: boolean;
  isToday: boolean;
  isFirstOfMonth: boolean;
  /** 0-based row, for consumers that care where in the window a day sits. */
  weekIndex: number;
  /** 0-based column within its row. */
  dayIndex: number;
};

export type CalendarWeek = {
  /** The `key` of the row's first day. */
  key: string;
  days: CalendarDay[];
};

const DAY_KEY_FORMAT = 'yyyy-MM-dd';

/**
 * Whether a date lands on Saturday or Sunday.
 *
 * Not date-fns' `isWeekend`, despite the name matching: that one is hardcoded
 * to Sat/Sun, which is right for this app but reads as though it follows
 * `weekStartsOn`. Spelled out here so the assumption is visible — a locale
 * whose weekend is Fri/Sat would change this function and nothing else.
 */
const isWeekendDay = (date: Date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/**
 * The continuous run of weeks the calendar draws.
 *
 * Deliberately NOT a month view. A course that runs sixteen weeks is four
 * page-turns of a month grid, and its start and end are never on screen
 * together; a rolling window of whole weeks shows the shape of a schedule in
 * one read. There are therefore no "outside the month" days to grey out —
 * every cell in the grid is a real, equal day.
 *
 * `weekStart` is normalised to the start of the week containing it, so a
 * caller may hand over any date and still get aligned rows.
 */
export function buildCalendarGrid({
  weekStart,
  weeks,
  today,
  weekStartsOn = DEFAULT_WEEK_STARTS_ON,
}: {
  weekStart: Date;
  weeks: number;
  /**
   * The day to mark. Defaults to now; passed explicitly by tests and by any
   * consumer that needs the mark to be stable across a render.
   */
  today?: Date;
  weekStartsOn?: WeekStartsOn;
}): CalendarWeek[] {
  const first = startOfWeek(weekStart, { weekStartsOn });
  const mark = today ?? new Date();

  return Array.from({ length: weeks }, (_, weekIndex) => {
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      // `addDays` from the window's first day, never `setDate` on a running
      // cursor: adding 24h at a time drops or repeats a day across a clock
      // change, and mutating a shared cursor makes every cell's date depend
      // on the order the array was built in.
      const date = startOfDay(addDays(first, weekIndex * 7 + dayIndex));
      const dayOfMonth = getDate(date);
      const isFirstOfMonth = dayOfMonth === 1;

      return {
        date,
        key: format(date, DAY_KEY_FORMAT),
        dayOfMonth,
        monthLabel: isFirstOfMonth ? format(date, 'MMM') : null,
        isWeekend: isWeekendDay(date),
        isToday: isSameDay(date, mark),
        isFirstOfMonth,
        weekIndex,
        dayIndex,
      } satisfies CalendarDay;
    });

    return { key: days[0].key, days };
  });
}

/**
 * Where the window should open for a given reference day.
 *
 * `weeksBefore` exists because a schedule is not only in the future. Opening
 * exactly on today's week means a course already under way begins off the top
 * edge, with nothing on screen saying when it started; a couple of weeks of
 * run-up keeps it visible.
 */
export function calendarWindowStart(
  reference: Date,
  {
    weeksBefore = 0,
    weekStartsOn = DEFAULT_WEEK_STARTS_ON,
  }: { weeksBefore?: number; weekStartsOn?: WeekStartsOn } = {},
): Date {
  return startOfWeek(addWeeks(reference, -weeksBefore), { weekStartsOn });
}

/** Step the window by whole weeks, keeping it aligned to the week start. */
export function shiftCalendarWindow(
  weekStart: Date,
  weeksDelta: number,
  {
    weekStartsOn = DEFAULT_WEEK_STARTS_ON,
  }: { weekStartsOn?: WeekStartsOn } = {},
): Date {
  return startOfWeek(addWeeks(weekStart, weeksDelta), { weekStartsOn });
}

/** The last day drawn — the day before the window's next start. */
function calendarWindowEnd(
  weekStart: Date,
  weeks: number,
  weekStartsOn: WeekStartsOn,
): Date {
  return addDays(startOfWeek(weekStart, { weekStartsOn }), weeks * 7 - 1);
}

/**
 * The caption above the grid: which days are on screen.
 *
 * Names the dates rather than the year. "2026" tells a reader nothing about
 * where they have scrolled to within it, and this window moves.
 *
 * The opening year is stated only when the window straddles new year —
 * printing it on every caption would put the same number twice in most of
 * them, and the one case where the two differ is exactly the case where a
 * reader needs telling.
 */
export function formatCalendarRange(
  weekStart: Date,
  weeks: number,
  {
    weekStartsOn = DEFAULT_WEEK_STARTS_ON,
  }: { weekStartsOn?: WeekStartsOn } = {},
): string {
  const first = startOfWeek(weekStart, { weekStartsOn });
  const last = calendarWindowEnd(weekStart, weeks, weekStartsOn);
  const sameYear = first.getFullYear() === last.getFullYear();

  // An en dash, not a hyphen: this is a range, and the hyphen reads as a
  // compound at this size.
  return `${format(first, sameYear ? 'd MMM' : 'd MMM yyyy')} – ${format(last, 'd MMM yyyy')}`;
}

/** A weekday column header, rotated to match `weekStartsOn`. */
export type CalendarWeekdayLabel = {
  key: string;
  label: string;
  isWeekend: boolean;
};

/**
 * The seven column headings.
 *
 * Derived from a real week rather than a hardcoded array so the names come
 * out of date-fns' locale data, and so the weekend flags cannot drift out of
 * step with the ones `buildCalendarGrid` puts on the cells beneath them.
 */
export function calendarWeekdayLabels(
  weekStartsOn: WeekStartsOn = DEFAULT_WEEK_STARTS_ON,
): CalendarWeekdayLabel[] {
  const first = startOfWeek(new Date(), { weekStartsOn });

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(first, index);
    return {
      key: String(index),
      label: format(date, 'EEE'),
      isWeekend: isWeekendDay(date),
    };
  });
}

/**
 * How many days a date sits from the window's first day, or `null` if it is
 * outside the window.
 *
 * Exported for consumers laying multi-day runs across the grid: the calendar
 * itself renders one cell per day and takes no view on what spans them, so
 * this is the shared piece of arithmetic they would otherwise each repeat.
 */
export function calendarDayOffset(
  date: Date,
  {
    weekStart,
    weeks,
    weekStartsOn = DEFAULT_WEEK_STARTS_ON,
  }: {
    weekStart: Date;
    weeks: number;
    weekStartsOn?: WeekStartsOn;
  },
): number | null {
  const offset = differenceInCalendarDays(
    date,
    startOfWeek(weekStart, { weekStartsOn }),
  );
  return offset < 0 || offset >= weeks * 7 ? null : offset;
}
