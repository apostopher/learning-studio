import { useDroppable } from '@dnd-kit/core';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { disciplineDndId } from '#/lib/dnd-ids';
import { DisciplineColumn } from './discipline-column';
import { LibraryLessonCardContainer } from './library-lesson-card-container';

/**
 * `disciplineId` for the leftmost "Untitled" column, whose lessons have no
 * discipline at all. Discipline ids are positive serials, so 0 can never
 * collide with a real one — and the column still has to be a droppable, or a
 * lesson dropped on it would look exactly like a lesson dropped on nothing.
 */
export const UNTITLED_DISCIPLINE_ID = 0;

/**
 * One discipline column, registered as a drop target.
 *
 * It is a droppable it will always refuse. That is deliberate: the editor
 * shares one DndContext across both panes, so a lesson dragged over the
 * library is over *something*, and the only way to answer "you cannot put it
 * back here, and here is why" is to be a real target that `resolveDrop`
 * refuses by name.
 */
export const DisciplineColumnContainer = ({
  disciplineId,
  name,
  lessons,
}: {
  disciplineId: number;
  name: string;
  lessons: LibraryLesson[];
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: disciplineDndId(disciplineId),
    data: { type: 'discipline', disciplineId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-full shrink-0 rounded-xl',
        // The ring is the error colour, not the accent: hovering here is
        // never going to work, and a welcoming highlight would say otherwise.
        isOver && 'ring-2 ring-error-9/40',
      )}
    >
      <DisciplineColumn name={name} lessonCount={lessons.length}>
        {lessons.length === 0 ? (
          <p className="px-1 py-4 text-center text-tertiary text-xs">
            No lessons
          </p>
        ) : (
          lessons.map((lesson) => (
            <LibraryLessonCardContainer key={lesson.id} lesson={lesson} />
          ))
        )}
      </DisciplineColumn>
    </div>
  );
};
