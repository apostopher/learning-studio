// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// `add-course-button.tsx` imports `@/lib/cn`, which vitest cannot resolve
// (only the `#/` alias is configured for it) — stub it down to a plain
// button so this suite doesn't fail on an unrelated resolution error before
// any assertion runs.
vi.mock('../add-course-button', () => ({
  AddCourseButton: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      Add course
    </button>
  ),
}));

import { CourseRail } from '../course-rail';

describe('CourseRail', () => {
  it('renders its children and calls onNewCourse when the new-course action is used', () => {
    // Mutant: `onNewCourse` is accepted but never wired onto the button's
    // `onClick` (e.g. the button renders with no handler). This assertion
    // fails against that mutant because the spy would never be called.
    const onNewCourse = vi.fn();
    render(
      <CourseRail onNewCourse={onNewCourse}>
        <div>2 Week course column</div>
      </CourseRail>,
    );
    expect(screen.getByText('2 Week course column')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /add course/i }));
    expect(onNewCourse).toHaveBeenCalledTimes(1);
  });

  it('omits the new-course action when onNewCourse is not supplied', () => {
    // Mutant: the `onNewCourse &&` guard is dropped, so the button always
    // renders (with a no-op click). This assertion fails against that
    // mutant because `queryByRole` would then resolve to an element.
    render(
      <CourseRail>
        <div>2 Week course column</div>
      </CourseRail>,
    );
    expect(screen.queryByRole('button', { name: /add course/i })).toBeNull();
  });
});
