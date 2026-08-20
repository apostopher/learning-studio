// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_FORBIDDEN } from '#/data-hooks/use-course-board';

const m = vi.hoisted(() => ({ useCourseBoard: vi.fn() }));

vi.mock('#/data-hooks/use-course-board', async () => {
  // The sentinel is a plain constant with no side effects, so it is kept real
  // — a stubbed copy would compare unequal to the one the container imports.
  const actual = await vi.importActual<
    typeof import('#/data-hooks/use-course-board')
  >('#/data-hooks/use-course-board');
  return { ...actual, useCourseBoard: m.useCourseBoard };
});
vi.mock('../course-actions-container', () => ({
  CourseActionsContainer: () => null,
}));
vi.mock('../module-board-container', () => ({
  ModuleBoardContainer: () => null,
}));

import { CourseBoardContainer } from '../course-board-container';

const CAPABILITIES = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * A 403 on the board is a refusal, not a fault. Before this it was thrown, so
 * a subject expert who bookmarked `/admin/7/editor` for a course they do not
 * staff was told "Failed to load the board." — which reads as broken software
 * and says nothing about what would unlock it.
 */
describe('CourseBoardContainer — refused board', () => {
  it('names the refusal and what unlocks it', () => {
    m.useCourseBoard.mockReturnValue({
      data: BOARD_FORBIDDEN,
      isLoading: false,
      error: null,
    });

    render(<CourseBoardContainer courseId={7} capabilities={CAPABILITIES} />);

    expect(
      screen.getByText(
        'You are not staff on this course. Ask an admin to assign you.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Failed to load the board.')).toBeNull();
  });

  it('still says "Course not found." for a course that does not exist', () => {
    m.useCourseBoard.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    render(<CourseBoardContainer courseId={7} capabilities={CAPABILITIES} />);

    expect(screen.getByText('Course not found.')).toBeTruthy();
  });

  it('still reports a genuine failure as one', () => {
    m.useCourseBoard.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    });

    render(<CourseBoardContainer courseId={7} capabilities={CAPABILITIES} />);

    expect(screen.getByText('Failed to load the board.')).toBeTruthy();
  });
});
