import { useDraggable } from '@dnd-kit/core';
import type { AdminCourseSummary } from '#/lib/admin-schemas';
import { ScheduleCourseCard } from './schedule-course-card';
import { scheduleCourseDndId } from './schedule-dnd';

/**
 * A course in the rail, made draggable.
 *
 * `useDraggable`, not `useSortable`: the rail is a source list. Dragging a
 * course does not move it — the rail is unchanged by a drop — it schedules a
 * new offering of it. The same course can be dragged out any number of times,
 * which is exactly what "a course has many offerings" means at the level of
 * the gesture.
 */
export const DraggableCourseContainer = ({
  course,
}: {
  course: AdminCourseSummary;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: scheduleCourseDndId(course.id),
    data: { type: 'schedule-course', courseId: course.id, name: course.name },
  });

  return (
    <div ref={setNodeRef}>
      <ScheduleCourseCard
        name={course.name}
        moduleCount={course.moduleCount}
        lessonCount={course.lessonCount}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
};
