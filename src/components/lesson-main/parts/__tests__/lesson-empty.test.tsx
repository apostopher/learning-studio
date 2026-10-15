// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonEmpty } from '../lesson-empty';

describe('LessonEmpty', () => {
  it('tells a pilot with no level that their level has not been set', () => {
    render(
      <LessonEmpty
        courseSlug="c"
        state={{ kind: 'none', reason: 'no-level' }}
      />,
    );
    expect(screen.getByRole('heading').textContent).toBe('No level set yet');
    expect(screen.getByRole('status').textContent).toContain(
      'Your training team hasn’t set your level for this course yet. Ask them to set it.',
    );
    // Promise nothing about lessons appearing: setting a level does not
    // guarantee there are lessons at it.
    expect(screen.queryByText(/will appear/)).toBeNull();
    // Not the "nothing published" copy — that would send them to wait for
    // content rather than to their training team.
    expect(screen.queryByText(/published/)).toBeNull();
  });

  it('tells a pilot whose level has no lessons that there are none at their level', () => {
    render(
      <LessonEmpty
        courseSlug="c"
        state={{ kind: 'none', reason: 'no-lessons-at-level' }}
      />,
    );
    expect(screen.getByRole('heading').textContent).toBe(
      'No lessons at your level',
    );
    expect(
      screen.getByText(
        /There are no lessons at your level in this course yet\./,
      ),
    ).toBeTruthy();
  });

  it('keeps the nothing-published copy for an empty course', () => {
    render(
      <LessonEmpty
        courseSlug="c"
        state={{ kind: 'none', reason: 'no-lessons' }}
      />,
    );
    expect(screen.getByRole('heading').textContent).toBe('No lessons yet');
  });
});
