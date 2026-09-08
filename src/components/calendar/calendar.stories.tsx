import type { Meta, StoryObj } from '@storybook/react-vite';
import { addDays } from 'date-fns';
import { useState } from 'react';
import { cn } from '#/lib/cn';
import { Calendar } from './calendar';
import { CalendarDayCell } from './calendar-day-cell';
import {
  type CalendarDay,
  calendarDayOffset,
  calendarWindowStart,
  formatCalendarRange,
  shiftCalendarWindow,
} from './calendar-grid';
import { CalendarHeader } from './calendar-header';

const meta: Meta<typeof Calendar> = {
  title: 'Calendar/Calendar',
  component: Calendar,
};
export default meta;

type Story = StoryObj<typeof Calendar>;

const TODAY = new Date(2026, 8, 9);
const WEEKS = 10;
const WINDOW_START = calendarWindowStart(TODAY, { weeksBefore: 2 });

/** Stand-ins for whatever a consumer schedules — one run per row of colour. */
const RUNS = [
  {
    id: 'UAS16-2609',
    name: 'UAS 16 Week',
    start: addDays(WINDOW_START, 16),
    days: 30,
    tone: 'bg-apple-9 text-apple-contrast',
  },
  {
    id: '2WK-2610',
    name: '2 Week',
    start: addDays(WINDOW_START, 24),
    days: 12,
    tone: 'bg-accent-9 text-accent-contrast',
  },
];

/**
 * A run drawn as one segment per day. The calendar positions nothing — it
 * hands over a day, and the consumer decides what that day carries.
 */
const RunSegments = ({ day }: { day: CalendarDay }) => {
  const offset = calendarDayOffset(day.date, {
    weekStart: WINDOW_START,
    weeks: WEEKS,
  });
  if (offset === null) return null;

  return (
    <>
      {RUNS.map((run) => {
        const from = calendarDayOffset(run.start, {
          weekStart: WINDOW_START,
          weeks: WEEKS,
        });
        if (from === null || offset < from || offset >= from + run.days) {
          return null;
        }
        const isStart = offset === from;

        return (
          <span
            key={run.id}
            className={cn(
              'flex h-5 items-center whitespace-nowrap px-1 font-mono text-xs',
              run.tone,
              // The caption is wider than one column, so on the run's first
              // day it runs across the days the run already covers rather
              // than being clipped to a single cell. The rest of the days are
              // plain blocks, so there is nothing for it to collide with.
              isStart && 'relative z-[1] overflow-visible',
            )}
          >
            {isStart ? `${run.name} · ${run.id}` : ''}
          </span>
        );
      })}
    </>
  );
};

export const WithScheduledRuns: Story = {
  render: () => {
    const [weekStart, setWeekStart] = useState(WINDOW_START);

    return (
      <div className="flex h-[42rem] flex-col border border-gray-6">
        <CalendarHeader
          title="Calendar"
          rangeLabel={formatCalendarRange(weekStart, WEEKS)}
          stepLabel="four weeks"
          onPrevious={() => setWeekStart((at) => shiftCalendarWindow(at, -4))}
          onNext={() => setWeekStart((at) => shiftCalendarWindow(at, 4))}
          onToday={() =>
            setWeekStart(calendarWindowStart(TODAY, { weeksBefore: 2 }))
          }
        />
        <Calendar
          label="Course schedule"
          weekStart={weekStart}
          weeks={WEEKS}
          today={TODAY}
          className="flex-1"
          renderDay={(day) => (
            <CalendarDayCell key={day.key} day={day}>
              <RunSegments day={day} />
            </CalendarDayCell>
          )}
        />
      </div>
    );
  },
};

/** The bare grid, with no `renderDay` — the default cell is all there is. */
export const Empty: Story = {
  args: {
    label: 'Course schedule',
    weekStart: WINDOW_START,
    weeks: 6,
    today: TODAY,
    className: 'h-[36rem]',
  },
};

/** The states a consumer's droppable drives: hovered, and closed. */
export const DayStates: Story = {
  render: () => (
    <Calendar
      label="Course schedule"
      weekStart={WINDOW_START}
      weeks={2}
      today={TODAY}
      className="h-[20rem]"
      renderDay={(day) => (
        <CalendarDayCell
          key={day.key}
          day={day}
          isOver={day.dayIndex === 2 && day.weekIndex === 0}
          isDisabled={day.isWeekend}
        >
          {day.isWeekend ? (
            <span className="font-mono text-tertiary text-xs">
              No intake — weekend
            </span>
          ) : null}
        </CalendarDayCell>
      )}
    />
  ),
};
