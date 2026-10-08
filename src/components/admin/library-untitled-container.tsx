import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { libraryLessonDndId, libraryUntitledDndId } from '#/lib/dnd-ids';
import { LibraryLessonCardContainer } from './library-lesson-card-container';
import { LibraryUntitled } from './library-untitled';

/**
 * A discipline's root-level lessons (filed in no module), wired to the shared
 * DndContext as the `library-untitled-<disciplineId>` droppable — dropping a
 * lesson here takes it out of its module but keeps it in this discipline.
 */
export const LibraryUntitledContainer = ({
  disciplineId,
  lessons,
}: {
  disciplineId: number;
  lessons: LibraryLesson[];
}) => {
  const { setNodeRef, isOver, active } = useDroppable({
    id: libraryUntitledDndId(disciplineId),
    data: { type: 'library-untitled', disciplineId },
  });
  // Only a library lesson can land here; a module or course drag gets no
  // invitation it would then be refused.
  const draggingLesson = active?.data.current?.type === 'library-lesson';

  return (
    <div ref={setNodeRef}>
      <LibraryUntitled
        lessonCount={lessons.length}
        showDropZone={draggingLesson}
        isOver={isOver && draggingLesson}
      >
        <SortableContext
          items={lessons.map((l) => libraryLessonDndId(l.id))}
          strategy={verticalListSortingStrategy}
        >
          {lessons.map((lesson) => (
            <LibraryLessonCardContainer
              key={lesson.id}
              lesson={lesson}
              disciplineId={disciplineId}
              boxId={null}
            />
          ))}
        </SortableContext>
      </LibraryUntitled>
    </div>
  );
};
