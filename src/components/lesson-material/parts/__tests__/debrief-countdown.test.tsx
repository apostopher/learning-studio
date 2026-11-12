// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DebriefCountdown } from '../debrief-countdown';

const props = {
  countdown: '5 h 40 min',
  clockTime: 'Tue 28 Oct, 3:40 PM',
  announcement: 'Your next debrief opens in 5 h 40 min.',
  headingLevel: 2 as const,
};

describe('DebriefCountdown', () => {
  it('heads with the live countdown, which screen readers do not hear on every tick', () => {
    render(<DebriefCountdown {...props} />);
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Your next debrief opens in 5 h 40 min',
    });
    expect(heading.getAttribute('aria-live')).toBe('off');
  });

  it('shows the exact clock time under it', () => {
    render(<DebriefCountdown {...props} />);
    expect(screen.getByText(/Tue 28 Oct, 3:40 PM/).textContent).toBe(
      'Opens Tue 28 Oct, 3:40 PM.',
    );
  });

  it('leaves the clock line out until the client-only time renders', () => {
    render(<DebriefCountdown {...props} clockTime={null} />);
    expect(screen.queryByText(/^Opens/)).toBeNull();
  });

  it('announces the sentence it is given in a visually hidden status', () => {
    render(<DebriefCountdown {...props} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(props.announcement);
    expect(status.className).toContain('sr-only');
  });

  it('takes the heading level of its context', () => {
    render(<DebriefCountdown {...props} headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3 })).toBeDefined();
  });
});
