// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its component test.
import { BOARD_FORBIDDEN, useCourseBoard } from '#/data-hooks/use-course-board';
import {
  CourseActionsContainer,
  type CourseToolbarCapabilities,
} from './course-actions-container';
import { CourseBoard } from './course-board';
import { ModuleBoardContainer } from './module-board-container';

export const CourseBoardContainer = ({
  courseId,
  capabilities,
}: {
  courseId: number;
  capabilities: CourseToolbarCapabilities;
}) => {
  const { data: board, isLoading, error } = useCourseBoard(courseId);

  if (isLoading) {
    return <div className="p-6 text-sm text-secondary">Loading board…</div>;
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-error-text">
        Failed to load the board.
      </div>
    );
  }
  // A refusal, not a failure — and a locked state has to say what unlocks it.
  // `structure:read` is course-scoped, so this is the ordinary answer for a
  // subject expert who opened the editor for a course they do not staff.
  if (board === BOARD_FORBIDDEN) {
    return (
      <div className="p-6 text-sm text-secondary">
        You are not staff on this course. Ask an admin to assign you.
      </div>
    );
  }
  if (!board) {
    return <div className="p-6 text-sm text-secondary">Course not found.</div>;
  }

  return (
    <CourseBoard
      courseName={board.course.name}
      toolbar={
        <CourseActionsContainer
          course={board.course}
          capabilities={capabilities}
        />
      }
    >
      {board.modules.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-secondary">No modules yet</p>
        </div>
      ) : (
        <ModuleBoardContainer courseId={courseId} modules={board.modules} />
      )}
    </CourseBoard>
  );
};
