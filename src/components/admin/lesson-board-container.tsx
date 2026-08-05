import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import type { BoardLesson } from '@/lib/admin-schemas';
import { containerDndId, lessonDndId } from '@/lib/dnd-ids';
import { SortableLessonCard } from './sortable-lesson-card';

/**
 * A module's lesson list within the board's shared DndContext: a droppable
 * container (so empty modules can receive a lesson) wrapping a vertical
 * SortableContext. All drag handling lives in ModuleBoardContainer.
 */
export const LessonBoardContainer = ({
  moduleId,
  lessons,
  posters,
}: {
  moduleId: number;
  lessons: BoardLesson[];
  /** lessonId → poster url, from `useLessonPosters`. Missing ids draw the
   *  grey tile. */
  posters: Record<string, string>;
}) => {
  const { setNodeRef } = useDroppable({
    id: containerDndId(moduleId),
    data: { type: 'container', moduleId },
  });
  const ids = lessons.map((l) => lessonDndId(l.id));

  return (
    <div ref={setNodeRef} className="flex min-h-12 flex-col gap-2">
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {lessons.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-tertiary">
            No lessons
          </p>
        ) : (
          lessons.map((lesson) => (
            <SortableLessonCard
              key={lesson.id}
              lesson={lesson}
              moduleId={moduleId}
              posterUrl={posters[lesson.id]}
            />
          ))
        )}
      </SortableContext>
    </div>
  );
};
