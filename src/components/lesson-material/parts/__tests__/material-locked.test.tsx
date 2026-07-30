// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MaterialLocked } from '../material-locked';

describe('MaterialLocked', () => {
  it('tells the student to watch the video', () => {
    render(
      <MaterialLocked
        lock={{ locked: true, reason: 'video' }}
        courseSlug="c"
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Watch the video');
  });

  it('names the blocking lesson and links to it', () => {
    render(
      <MaterialLocked
        lock={{
          locked: true,
          reason: 'lesson',
          blockedBy: {
            lessonSlug: 'a',
            moduleSlug: 'm1',
            lessonName: 'Close Encounters',
          },
        }}
        courseSlug="c"
      />,
    );
    // "Finish Close Encounters first" is actionable; "prerequisite not met" is not.
    expect(screen.getByRole('status').textContent).toContain(
      'Close Encounters',
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/course/c/modules/m1/lessons/a',
    );
  });

  it('names the blocking module', () => {
    render(
      <MaterialLocked
        lock={{
          locked: true,
          reason: 'module',
          blockedBy: { moduleSlug: 'm1', moduleName: 'Wakeup Call' },
        }}
        courseSlug="c"
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Wakeup Call');
  });
});
