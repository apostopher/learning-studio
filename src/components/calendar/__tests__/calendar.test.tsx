// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Calendar } from '../calendar';
import { CalendarDayCell } from '../calendar-day-cell';
import type { CalendarDay } from '../calendar-grid';

/** 7 Sep 2026 is a Monday. */
const MONDAY = new Date(2026, 8, 7);

describe('Calendar', () => {
  it('hands every day in the window to renderDay, in order', () => {
    const renderDay = vi.fn((day: CalendarDay) => (
      <CalendarDayCell day={day} />
    ));

    render(
      <Calendar
        label="Schedule"
        weekStart={MONDAY}
        weeks={10}
        today={MONDAY}
        renderDay={renderDay}
      />,
    );

    const seen = renderDay.mock.calls.map(([day]) => day);
    expect(seen).toHaveLength(70);
    expect(seen[0].key).toBe('2026-09-07');
    expect(seen.at(-1)?.key).toBe('2026-11-15');
  });

  it('tells renderDay which days are the weekend and which is today', () => {
    const renderDay = vi.fn((day: CalendarDay) => (
      <CalendarDayCell day={day} />
    ));

    render(
      <Calendar
        label="Schedule"
        weekStart={MONDAY}
        weeks={1}
        today={new Date(2026, 8, 9)}
        renderDay={renderDay}
      />,
    );

    const seen = renderDay.mock.calls.map(([day]) => day);
    expect(seen.map((day) => day.isWeekend)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(seen.filter((day) => day.isToday).map((day) => day.key)).toEqual([
      '2026-09-09',
    ]);
  });

  it('renders what renderDay returns', () => {
    render(
      <Calendar
        label="Schedule"
        weekStart={MONDAY}
        weeks={1}
        renderDay={(day) => (
          <CalendarDayCell day={day}>
            <span>BAR_{day.key}</span>
          </CalendarDayCell>
        )}
      />,
    );

    expect(screen.getByText('BAR_2026-09-07')).toBeDefined();
    expect(screen.getByText('BAR_2026-09-13')).toBeDefined();
  });

  it('names the calendar as one region', () => {
    render(<Calendar label="Course schedule" weekStart={MONDAY} weeks={2} />);

    expect(
      screen.getByRole('region', { name: 'Course schedule' }),
    ).toBeDefined();
  });

  it('heads the columns with a Monday-first weekday row', () => {
    const { container } = render(
      <Calendar label="Schedule" weekStart={MONDAY} weeks={2} />,
    );

    expect(
      [...container.querySelectorAll('[data-calendar-weekday]')].map(
        (el) => el.textContent,
      ),
    ).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  // The seven abbreviations are decoration: each cell names its own weekday
  // in full, so reading the header out first is noise, not context.
  it('hides the weekday row from assistive tech', () => {
    const { container } = render(
      <Calendar label="Schedule" weekStart={MONDAY} weeks={1} />,
    );

    const header = container
      .querySelector('[data-calendar-weekday]')
      ?.closest('[aria-hidden="true"]');
    expect(header).not.toBeNull();
    expect(
      screen.queryByText('Mon', { ignore: '[aria-hidden="true"] *' }),
    ).toBeNull();
  });

  it('renders seven days per week for the whole window', () => {
    const { container } = render(
      <Calendar label="Schedule" weekStart={MONDAY} weeks={4} />,
    );

    expect(container.querySelectorAll('[data-calendar-day]')).toHaveLength(28);
  });

  it('falls back to a plain day cell when no renderDay is given', () => {
    const { container } = render(
      <Calendar label="Schedule" weekStart={MONDAY} weeks={1} />,
    );

    const cells = [...container.querySelectorAll('[data-calendar-day]')];
    expect(cells).toHaveLength(7);
    expect(cells[0].getAttribute('data-calendar-day')).toBe('2026-09-07');
    expect(cells[0].textContent).toContain('7');
  });
});

describe('CalendarDayCell', () => {
  const day: CalendarDay = {
    date: new Date(2026, 9, 1),
    key: '2026-10-01',
    dayOfMonth: 1,
    monthLabel: 'Oct',
    isWeekend: false,
    isToday: false,
    isFirstOfMonth: true,
    weekIndex: 3,
    dayIndex: 3,
  };

  it('names the full date for assistive tech, not just the number', () => {
    render(<CalendarDayCell day={day} />);

    expect(screen.getByText('Thursday 1 October 2026')).toBeDefined();
  });

  it('shows the month alongside the number on the first of a month', () => {
    const { container } = render(<CalendarDayCell day={day} />);

    expect(
      container.querySelector('[data-calendar-day]')?.textContent,
    ).toContain('Oct 1');
  });

  it('forwards the ref and arbitrary props to the cell itself, so a consumer can make it a drop target', () => {
    const onDrop = vi.fn();
    let node: HTMLElement | null = null;

    render(
      <CalendarDayCell
        day={day}
        ref={(el) => {
          node = el;
        }}
        data-testid="cell"
        onDrop={onDrop}
      />,
    );

    expect(node).toBe(screen.getByTestId('cell'));
    expect(screen.getByTestId('cell').getAttribute('data-calendar-day')).toBe(
      '2026-10-01',
    );
  });

  it('marks the drag-over and disabled states on the cell', () => {
    const { container, rerender } = render(<CalendarDayCell day={day} />);
    const cell = () => container.querySelector('[data-calendar-day]');
    expect(cell()?.getAttribute('data-over')).toBeNull();

    rerender(<CalendarDayCell day={day} isOver isDisabled />);
    expect(cell()?.getAttribute('data-over')).toBe('true');
    expect(cell()?.getAttribute('data-disabled')).toBe('true');
  });

  // `isDisabled` dims the cell and says nothing. A locked state has to state
  // its reason, and this component cannot know it — so it must not imply one.
  it('leaves a disabled day free of an aria-disabled it cannot explain', () => {
    const { container } = render(<CalendarDayCell day={day} isDisabled />);

    expect(
      container
        .querySelector('[data-calendar-day]')
        ?.getAttribute('aria-disabled'),
    ).toBeNull();
  });
});
