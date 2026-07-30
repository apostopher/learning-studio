// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonLocked } from '../lesson-locked';

describe('LessonLocked', () => {
  it('names the blocking lesson and links to it', () => {
    render(
      <LessonLocked
        lessonName="Crosswind landings"
        courseSlug="c"
        lock={{
          locked: true,
          reason: 'lesson',
          blockedBy: {
            lessonSlug: 'a',
            moduleSlug: 'm1',
            lessonName: 'Close Encounters',
          },
        }}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Crosswind landings');
    // "Finish Close Encounters first" is actionable; "prerequisite not met" is not.
    expect(status.textContent).toContain('Close Encounters');
    expect(status.textContent).toContain('first');
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/course/c/modules/m1/lessons/a',
    );
  });

  it('names the blocking module', () => {
    render(
      <LessonLocked
        lessonName="Crosswind landings"
        courseSlug="c"
        lock={{
          locked: true,
          reason: 'module',
          blockedBy: { moduleSlug: 'm1', moduleName: 'Wakeup Call' },
        }}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Wakeup Call');
    expect(status.textContent).toContain('first');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
