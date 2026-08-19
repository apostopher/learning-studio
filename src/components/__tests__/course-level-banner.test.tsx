// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CourseLevelBanner } from '../course-level-banner';

describe('CourseLevelBanner', () => {
  it('announces an earned promotion as an achievement, with no admin message', () => {
    render(
      <CourseLevelBanner
        level="Intermediate"
        source="earned"
        message={null}
        onDismiss={vi.fn()}
      />,
    );
    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('You’ve reached Intermediate');
    expect(banner.textContent).not.toContain('changed to');
  });

  it('announces an admin change as something done to the pilot, carrying the message', () => {
    render(
      <CourseLevelBanner
        level="Advanced"
        source="admin"
        message="Nice flying at the fly-in."
        onDismiss={vi.fn()}
      />,
    );
    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('changed to Advanced');
    expect(banner.textContent).toContain('Nice flying at the fly-in.');
    expect(banner.textContent).not.toContain('You’ve reached');
  });

  it('renders an admin change with no message', () => {
    render(
      <CourseLevelBanner
        level="Advanced"
        source="admin"
        message={null}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'changed to Advanced',
    );
  });

  it('fires onDismiss when the Dismiss control is pressed', () => {
    const onDismiss = vi.fn();
    render(
      <CourseLevelBanner
        level="Advanced"
        source="earned"
        message={null}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
