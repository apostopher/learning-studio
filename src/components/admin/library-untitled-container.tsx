import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { libraryLessonDndId, libraryUntitledDndId } from '#/lib/dnd-ids';
import { LibraryLessonCardContainer } from './library-lesson-card-container';
import { LibraryUntitled } from './library-untitled';

/** Wraps its children in the real `library-untitled-<id>` droppable. Its own
 *  component (rather than an inline conditional hook call inside
 *  `LibraryUntitledContainer`) so the org-level column can skip registering
 *  a droppable entirely rather than merely disabling one — see the note on
 *  `isOrgLevel` below. */
const DroppableUntitled = ({
  disciplineId,
  children,
}: {
  disciplineId: number;
  children: ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: libraryUntitledDndId(disciplineId),
    data: { type: 'library-untitled', disciplineId },
  });
  return (
    <div ref={setNodeRef} className={cn(isOver && 'bg-gray-3')}>
      {children}
    </div>
  );
};

/**
 * A discipline's Untitled group, wired to the shared DndContext.
 */
export const LibraryUntitledContainer = ({
  disciplineId,
  lessons,
  isOrgLevel = false,
}: {
  disciplineId: number;
  lessons: LibraryLesson[];
  /**
   * True only for the org-level "Untitled" column (lessons with no
   * discipline at all): the whole column already says "Untitled" in its own
   * header, and its lessons must stay draggable into a course, so this
   * group renders with no heading of its own and — deliberately — no
   * `library-untitled-<UNTITLED_DISCIPLINE_ID>` droppable. Registering one
   * would give a lesson dropped there two indistinguishable "put it in
   * Untitled" targets on the same column.
   */
  isOrgLevel?: boolean;
}) => {
  const content = (
    <LibraryUntitled lessonCount={lessons.length} showHeading={!isOrgLevel}>
      <SortableContext
        items={lessons.map((l) => libraryLessonDndId(l.id))}
        strategy={verticalListSortingStrategy}
      >
        {lessons.map((lesson) => (
          <LibraryLessonCardContainer
            key={lesson.id}
            lesson={lesson}
            disciplineId={disciplineId}
          />
        ))}
      </SortableContext>
    </LibraryUntitled>
  );

  return isOrgLevel ? (
    content
  ) : (
    <DroppableUntitled disciplineId={disciplineId}>{content}</DroppableUntitled>
  );
};
