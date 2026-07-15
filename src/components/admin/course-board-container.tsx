import { useCourseBoard } from '@/data-hooks/use-course-board';
import { CourseBoard } from './course-board';
import { CreateModuleDialogContainer } from './create-module-dialog-container';
import { ModuleBoardContainer } from './module-board-container';

export const CourseBoardContainer = ({ courseId }: { courseId: number }) => {
  const { data: board, isLoading, error } = useCourseBoard(courseId);

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-11">Loading board…</div>;
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-red-11">Failed to load the board.</div>
    );
  }
  if (!board) {
    return <div className="p-6 text-sm text-gray-11">Course not found.</div>;
  }

  return (
    <CourseBoard
      courseName={board.course.name}
      toolbar={<CreateModuleDialogContainer courseId={courseId} />}
    >
      {board.modules.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-11">No modules yet</p>
        </div>
      ) : (
        <ModuleBoardContainer courseId={courseId} modules={board.modules} />
      )}
    </CourseBoard>
  );
};
