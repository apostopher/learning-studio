import { useCourseBoard } from '@/data-hooks/use-course-board';
import { CourseActionsContainer } from './course-actions-container';
import { CourseBoard } from './course-board';
import { ModuleBoardContainer } from './module-board-container';

export const CourseBoardContainer = ({ courseId }: { courseId: number }) => {
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
  if (!board) {
    return <div className="p-6 text-sm text-secondary">Course not found.</div>;
  }

  return (
    <CourseBoard
      courseName={board.course.name}
      toolbar={<CourseActionsContainer course={board.course} />}
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
