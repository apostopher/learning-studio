// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ useAdminCourses: vi.fn() }));

vi.mock('#/data-hooks/use-admin-courses', () => ({
  useAdminCourses: m.useAdminCourses,
}));
vi.mock('../course-tile', () => ({
  CourseTile: ({ course }: { course: { name: string } }) => (
    <span>{course.name}</span>
  ),
}));
vi.mock('../create-course-dialog-container', () => ({
  CreateCourseDialogContainer: () => <button type="button">Add course</button>,
}));

import { AdminCoursesPageContainer } from '../admin-courses-page-container';

function renderPage(canCreateCourse: boolean, courses: unknown[] = []) {
  m.useAdminCourses.mockReturnValue({
    data: courses,
    isLoading: false,
    error: null,
  });
  render(<AdminCoursesPageContainer canCreateCourse={canCreateCourse} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminCoursesPageContainer', () => {
  it('offers course creation to an actor holding course:create', () => {
    renderPage(true);

    expect(screen.getByRole('button', { name: 'Add course' })).toBeDefined();
  });

  /**
   * `course:create` is org-level with no staff fallback — a subject expert
   * authors inside a course, they do not found one. A button whose POST is
   * guaranteed to 403 is worse than no button.
   */
  it('hides course creation from a staff-only actor', () => {
    renderPage(false);

    expect(screen.queryByRole('button', { name: 'Add course' })).toBeNull();
  });

  /**
   * The empty state has to say why it is empty. "Create your first course" is
   * an instruction a subject expert cannot follow.
   */
  it('tells a staff-only actor what would put a course here', () => {
    renderPage(false);

    expect(
      screen.getByText(
        'You will see a course here once an admin assigns you to one as staff.',
      ),
    ).toBeDefined();
    expect(
      screen.queryByText('Create your first course to get started.'),
    ).toBeNull();
  });

  it('keeps the create prompt for someone who can act on it', () => {
    renderPage(true);

    expect(
      screen.getByText('Create your first course to get started.'),
    ).toBeDefined();
  });

  it('lists whatever the endpoint returned, scoped or not', () => {
    renderPage(false, [{ id: 4, name: 'Private Pilot' }]);

    expect(screen.getByText('Private Pilot')).toBeDefined();
    // Nothing here filters — the server decided the scope.
    expect(m.useAdminCourses).toHaveBeenCalled();
  });
});
