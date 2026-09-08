// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CalendarHeader } from '../calendar-header';

const setup = () => {
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  const onToday = vi.fn();

  render(
    <CalendarHeader
      title="Course schedule"
      rangeLabel="7 Sep – 15 Nov 2026"
      stepLabel="four weeks"
      onPrevious={onPrevious}
      onNext={onNext}
      onToday={onToday}
    />,
  );

  return { onPrevious, onNext, onToday };
};

describe('CalendarHeader', () => {
  it('calls the consumer back for each direction', async () => {
    const user = userEvent.setup();
    const { onPrevious, onNext, onToday } = setup();

    await user.click(screen.getByRole('button', { name: 'Back four weeks' }));
    await user.click(screen.getByRole('button', { name: 'On four weeks' }));
    await user.click(screen.getByRole('button', { name: 'Today' }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  // The arrows change the caption and nothing else on screen, so it has to
  // announce itself or the press is silent for a screen reader user.
  it('announces the visible range', () => {
    setup();

    const caption = screen.getByText('7 Sep – 15 Nov 2026');
    expect(caption.getAttribute('aria-live')).toBe('polite');
  });
});
