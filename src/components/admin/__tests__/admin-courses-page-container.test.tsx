// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ useAdminCourses: vi.fn() }));

vi.mock('#/data-hooks/use-admin-courses', async (importOriginal) => ({
  // The real error class: `isRefused` is an `instanceof` check, and a stub
  // class would make it pass for the wrong reason.
  ...(await importOriginal<object>()),
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

import { AdminCoursesRequestError } from '#/data-hooks/use-admin-courses';
import { AdminCoursesPageContainer } from '../admin-courses-page-container';

function renderPage({
  canCreateCourse = false,
  canReadCatalogue = false,
  courses = [] as unknown[],
  error = null as unknown,
}) {
  m.useAdminCourses.mockReturnValue({
    data: error ? undefined : courses,
    isLoading: false,
    error,
  });
  render(
    <AdminCoursesPageContainer
      canCreateCourse={canCreateCourse}
      canReadCatalogue={canReadCatalogue}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminCoursesPageContainer', () => {
  it('offers course creation to an actor holding course:create', () => {
    renderPage({ canCreateCourse: true, canReadCatalogue: true });

    expect(screen.getByRole('button', { name: 'Add course' })).toBeDefined();
  });

  /**
   * `course:create` is org-level with no staff fallback — a subject expert
   * authors inside a course, they do not found one. A button whose POST is
   * guaranteed to 403 is worse than no button.
   */
  it('hides course creation from a staff-only actor', () => {
    renderPage({});

    expect(screen.queryByRole('button', { name: 'Add course' })).toBeNull();
  });

  /**
   * Scope and creation are different facts. This state — browses the whole
   * catalogue, cannot create — is exactly the one that used to be told it was
   * waiting on a staff assignment.
   */
  it('describes the catalogue to an admin who cannot create courses', () => {
    renderPage({ canReadCatalogue: true, canCreateCourse: false });

    expect(
      screen.getByText('Manage your courses and their modules.'),
    ).toBeDefined();
    expect(screen.queryByText('The courses you are staff on.')).toBeNull();
    expect(
      screen.queryByText(
        'You will see a course here once an admin assigns you to one as staff.',
      ),
    ).toBeNull();
  });

  it('describes the scoped list to a staff-only actor', () => {
    renderPage({});

    expect(screen.getByText('The courses you are staff on.')).toBeDefined();
  });

  /**
   * Reachable: `getStaffScopedCourseIds` and the course query are two reads,
   * so a staff row removed between them yields a scoped list that came back
   * empty rather than a 403.
   */
  it('tells a staff-only actor what would put a course here', () => {
    renderPage({});

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
    renderPage({ canCreateCourse: true, canReadCatalogue: true });

    expect(
      screen.getByText('Create your first course to get started.'),
    ).toBeDefined();
  });

  /**
   * A 403 is a refusal, not a failure. "Please try again" is untrue — retrying
   * cannot succeed — and a locked state owes its reason.
   */
  it('explains a refusal instead of inviting a retry', () => {
    renderPage({
      error: new AdminCoursesRequestError('Failed to load courses (403)', 403),
    });

    expect(
      screen.getByText(
        'You are not staff on any course. Ask an admin to assign you to one.',
      ),
    ).toBeDefined();
    expect(
      screen.queryByText('Failed to load courses. Please try again.'),
    ).toBeNull();
  });

  it('still invites a retry on a genuine failure', () => {
    renderPage({
      error: new AdminCoursesRequestError('Failed to load courses (500)', 500),
    });

    expect(
      screen.getByText('Failed to load courses. Please try again.'),
    ).toBeDefined();
  });

  it('lists whatever the endpoint returned, scoped or not', () => {
    renderPage({ courses: [{ id: 4, name: 'Private Pilot' }] });

    expect(screen.getByText('Private Pilot')).toBeDefined();
    // Nothing here filters — the server decided the scope.
    expect(m.useAdminCourses).toHaveBeenCalled();
  });
});
