import { Fragment, type ReactNode } from 'react';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { cn } from '#/lib/cn';
import { ScrollArea } from '../scroll-area';
import { CalendarDayCell } from './calendar-day-cell';
import {
  buildCalendarGrid,
  type CalendarDay,
  calendarWeekdayLabels,
  type WeekStartsOn,
} from './calendar-grid';

/**
 * A rolling, week-aligned calendar grid — the reusable half of any
 * schedule-shaped screen.
 *
 * It draws days and nothing else. What sits ON a day is entirely the
 * consumer's: `renderDay` is handed one `CalendarDay` at a time and returns
 * that cell, which is what lets the same grid carry drop targets, bars,
 * counts or plain numbers without this component knowing about any of them.
 *
 * A run spanning several days is drawn as one segment per day, by the
 * consumer, rather than as a spanning element this component positions. That
 * is a deliberate limit: a bar that spans is a bar that has to know about row
 * breaks, window edges and stacking order, none of which the grid can answer
 * for. Per-day segments wrap at the end of a week for free, and
 * `calendarDayOffset` is exported for the arithmetic that remains.
 *
 * ACCESSIBILITY. Deliberately not an ARIA `grid`. That role is a contract to
 * implement roving-tabindex arrow-key navigation across the cells, which this
 * component does not do and cannot do on the consumer's behalf — the
 * focusable things in a cell are theirs. Claiming it anyway would advertise
 * keyboard navigation that isn't there. Instead: the whole calendar is one
 * named region, the weekday header is `aria-hidden` decoration, and each cell
 * carries its own full date in an `sr-only` span, so a screen reader reading
 * in document order hears "Thursday 1 October 2026" followed by whatever is
 * on that day. If a consumer needs true grid navigation, that belongs here as
 * an opt-in with the key handling to match, not as a bare role.
 *
 * Presentational and hookless. The visible window is a prop — the consumer
 * holds it in an atom and moves it with `shiftCalendarWindow`.
 */
export const Calendar = ({
  label,
  weekStart,
  weeks = 10,
  today,
  weekStartsOn = 1,
  renderDay,
  className,
  viewportClassName,
}: {
  /** Accessible name for the calendar region. */
  label: string;
  /** Any date in the first week to draw; normalised to that week's start. */
  weekStart: Date;
  /**
   * How many weeks are on screen. Ten is the mockup's window: long enough
   * that a multi-month course shows its start and end together.
   */
  weeks?: number;
  /** The day to mark. Defaults to now. */
  today?: Date;
  weekStartsOn?: WeekStartsOn;
  /**
   * Renders one day. Should return a `CalendarDayCell` (or something built on
   * one) — it is the direct child of the seven-column track, so anything else
   * has to lay itself out as a grid item.
   */
  renderDay?: (day: CalendarDay) => ReactNode;
  className?: string;
  viewportClassName?: string;
}) => {
  const weekdays = calendarWeekdayLabels(weekStartsOn);
  // Flattened: the rows exist visually because the track is seven columns
  // wide, so there is nothing left for a per-week wrapper to do. It used to
  // wrap each week for `role="row"`, and with the roles gone it would only be
  // an element that has to be `display: contents` to stay out of the way.
  const days = buildCalendarGrid({
    weekStart,
    weeks,
    today,
    weekStartsOn,
  }).flatMap((week) => week.days);

  return (
    <ScrollArea
      orientation="vertical"
      className={cn('min-h-0', className)}
      viewportClassName={viewportClassName}
    >
      <section
        aria-label={label}
        className="grid grid-cols-7 border-gray-6 border-s border-t bg-gray-1"
      >
        {/*
          Decoration, not structure. Every cell below names its own weekday in
          full, so repeating seven abbreviations to a screen reader before the
          content starts is noise.
        */}
        <div className="contents" aria-hidden="true">
          {weekdays.map((weekday) => (
            <div
              key={weekday.key}
              data-calendar-weekday={weekday.key}
              // Sticky inside the scroll viewport rather than a separate
              // element above it: as its own element it drifted out of line
              // with the columns the moment the body grew a scrollbar.
              className={cn(
                'sticky top-0 z-[2] border-gray-6 border-b border-e px-2 py-1.5',
                'font-semibold text-secondary text-xs uppercase tracking-wider',
                weekday.isWeekend ? 'bg-gray-3' : 'bg-gray-2',
              )}
            >
              {weekday.label}
            </div>
          ))}
        </div>
        {days.map((day) =>
          renderDay ? (
            <Fragment key={day.key}>{renderDay(day)}</Fragment>
          ) : (
            <CalendarDayCell key={day.key} day={day} />
          ),
        )}
      </section>
    </ScrollArea>
  );
};
