import { useDraggable } from '@dnd-kit/core';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { libraryLessonDndId } from '#/lib/dnd-ids';
import { LibraryLessonCard } from './library-lesson-card';

/**
 * A library lesson made draggable inside the editor's shared DndContext.
 *
 * `useDraggable`, not `useSortable`: the library is a source list, not a
 * sortable one. Registering these cards as droppables too would make one
 * library card a legal target for another and put a meaningless drop on the
 * board that the whitelist would then have to explain away.
 */
export const LibraryLessonCardContainer = ({
  lesson,
  disciplineId,
}: {
  lesson: LibraryLesson;
  /**
   * The column this card came from. Carried in the drag data so collision
   * detection can leave that one column out of the candidate set: releasing a
   * card back where it started is "never mind", and answering it with a red
   * refusal toast would make the universal cancel gesture look like an error.
   */
  disciplineId: number;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: libraryLessonDndId(lesson.id),
    data: { type: 'library-lesson', lessonId: lesson.id, disciplineId },
  });

  return (
    <div ref={setNodeRef} className={cn(isDragging && 'opacity-40')}>
      <LibraryLessonCard
        lesson={lesson}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
};
