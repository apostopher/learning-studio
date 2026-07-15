import { useCourseBoard } from '@/data-hooks/use-course-board';
import { CourseBoard } from './course-board';

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
  return <CourseBoard board={board} />;
};
