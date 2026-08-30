import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardLesson } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { lessonDndId } from '#/lib/dnd-ids';
import { LessonCard } from './lesson-card';

/**
 * A lesson already placed in a module, made sortable inside the editor's
 * shared DndContext.
 *
 * Distinct from `SortableLessonCard`, which is the single-course board's
 * version: that one also mounts a quickshot container and wires the config,
 * delete and play dialogs, all of which are course-scoped and mounted by the
 * course editor route. Here the card is a drag subject and nothing else —
 * every action on it belongs to a screen this pane does not own.
 *
 * `courseId` rides in the drag data so collision filtering can tell one
 * course's lessons from another's without walking the board.
 */
export const EditorLessonCardContainer = ({
  lesson,
  moduleId,
  courseId,
}: {
  lesson: BoardLesson;
  moduleId: number;
  courseId: number;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isSorting,
    isDragging,
  } = useSortable({
    id: lessonDndId(lesson.id),
    data: { type: 'lesson', lessonId: lesson.id, moduleId, courseId },
  });

  return (
    <div
      ref={setNodeRef}
      // Only animate the shift while sorting: after the drop the optimistic
      // update has already placed the card in its final slot, so a transition
      // would slide it from a position it never really held.
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isSorting ? transition : undefined,
      }}
      className={cn(isDragging && 'opacity-40')}
    >
      <LessonCard
        lesson={lesson}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
};
