import { format } from 'date-fns';
import type { ComponentPropsWithRef, ReactNode } from 'react';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { cn } from '#/lib/cn';
import type { CalendarDay } from './calendar-grid';

/**
 * One day in the grid: the cell chrome, the date badge, and a slot for
 * whatever the consumer puts on that day.
 *
 * This is the piece a consumer composes INSIDE their own container — the
 * container owns `useDroppable`, this owns how a day looks. Every prop it
 * does not recognise is spread onto the cell element itself, so a
 * drag-and-drop ref and its listeners land on the real cell rather than on a
 * wrapper nested inside it. That distinction is the whole point of the split:
 * a droppable smaller than the cell it looks like leaves dead strips along
 * the cell's edges where a drop silently does nothing.
 *
 * No ARIA role. `role="gridcell"` was the obvious reach and it is wrong here:
 * it obliges the containing `grid` to implement roving-tabindex arrow-key
 * navigation, which this component does not do, and a grid that claims that
 * contract without honouring it strands the keyboard users it advertises to.
 * The cell instead states its own full date in text (below), which is what a
 * screen reader actually needs — the visible column header is then decorative
 * and marked `aria-hidden` by `Calendar`.
 *
 * Presentational and hookless — no state, no effects, no data. A consumer's
 * `isOver` comes from their drag context and is passed down.
 */
export const CalendarDayCell = ({
  day,
  isOver = false,
  isDisabled = false,
  children,
  className,
  ...props
}: {
  day: CalendarDay;
  /** The cell is under an active drag. Supplied by the consumer's droppable. */
  isOver?: boolean;
  /**
   * Nothing can be dropped here — a past day, a blackout, a closed intake.
   *
   * VISUAL ONLY. It dims the cell and sets `data-disabled`, and deliberately
   * does not set `aria-disabled`: this cell has no ARIA role to be disabled
   * against, and a dimmed cell that announces nothing is a locked state with
   * no stated reason. The reason is the consumer's to supply — pass it as
   * `children`, where a screen reader reaches it like any other cell content.
   */
  isDisabled?: boolean;
  children?: ReactNode;
} & Omit<ComponentPropsWithRef<'div'>, 'children'>) => (
  <div
    // The hook a consumer's tests and a print stylesheet reach a day by.
    data-calendar-day={day.key}
    data-disabled={isDisabled || undefined}
    data-weekend={day.isWeekend || undefined}
    data-today={day.isToday || undefined}
    data-over={isOver || undefined}
    className={cn(
      // Sized from the mockup's 134px floor: five stacked bars plus the date
      // badge, at a type size that survives being printed. Cells GROW past
      // that rather than clipping — a genuinely busy week should look busy.
      'flex min-h-[8.375rem] min-w-0 flex-col gap-1 p-1.5',
      // Inline-axis border is logical. The block-axis one is `border-b`
      // because Tailwind v4 ships no block-axis logical border utility
      // (`border-s`/`border-e` exist, `border-be` does not); the block axis
      // does not flip in RTL, so nothing is lost.
      'border-gray-6 border-b border-e',
      day.isWeekend ? 'bg-gray-2' : 'bg-gray-1',
      // An inset ring, so today is marked without the cell changing size and
      // nudging the whole row.
      day.isToday && 'ring-2 ring-accent-8 ring-inset',
      isOver &&
        'bg-accent-3 outline-2 outline-accent-8 outline-dashed -outline-offset-2',
      // A diagonal hatch, NOT `opacity`. Dimming the cell dims the sentence
      // inside it saying why the day is closed — the one thing that has to
      // stay readable. The hatch is a background, so the reason keeps its
      // full contrast. (A visual diagonal: it does not flip in RTL.)
      isDisabled &&
        'bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,var(--color-gray-a3)_5px,var(--color-gray-a3)_10px)]',
      className,
    )}
    {...props}
  >
    <span
      className={cn(
        'grid h-5 shrink-0 place-items-center self-start rounded-sm px-1.5 font-mono text-xs tabular-nums',
        // The 1st gets the month with it and a solid ground: it is the only
        // thing marking a month boundary in a grid that has no month rows.
        day.isFirstOfMonth
          ? 'bg-accent-9 font-semibold text-accent-contrast'
          : cn('text-primary', day.isWeekend ? 'bg-gray-4' : 'bg-gray-3'),
      )}
    >
      {/*
        "7" on its own is not a date. Assistive tech gets the whole thing —
        the column header only supplies the weekday, and nothing else in the
        grid says which month a mid-month day belongs to.
      */}
      <span className="sr-only">{format(day.date, 'EEEE d MMMM yyyy')}</span>
      <span aria-hidden="true">
        {day.monthLabel ? `${day.monthLabel} ` : ''}
        {day.dayOfMonth}
      </span>
    </span>
    {children ? (
      <div className="flex min-w-0 flex-col gap-0.5">{children}</div>
    ) : null}
  </div>
);
