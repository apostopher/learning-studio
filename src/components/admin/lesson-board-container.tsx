import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

// `#/` not `@/`: vitest cannot resolve the `@/` alias, and the column's test
// renders this module.
import type { BoardCourse, BoardModule } from '#/lib/admin-schemas';
import { containerDndId, lessonDndId } from '#/lib/dnd-ids';
import { SortableLessonCard } from './sortable-lesson-card';

/**
 * A module's lesson list within the board's shared DndContext: a droppable
 * container (so empty modules can receive a lesson) wrapping a vertical
 * SortableContext. All drag handling lives in ModuleBoardContainer.
 */
export const LessonBoardContainer = ({
  course,
  module: mod,
  posters,
}: {
  course: Pick<BoardCourse, 'id' | 'name'>;
  /** The whole module: each card's quickshot needs it, not just its id. */
  module: BoardModule;
  /** lessonId → poster url, from `useLessonPosters`. Missing ids draw the
   *  grey tile. */
  posters: Record<string, string>;
}) => {
  const { id: courseId, name: courseName } = course;
  const { id: moduleId, name, lessons } = mod;
  const { setNodeRef } = useDroppable({
    id: containerDndId(courseId, moduleId),
    data: { type: 'container', moduleId },
  });
  const ids = lessons.map((l) => lessonDndId(courseId, l.id));

  return (
    <div ref={setNodeRef} className="flex min-h-12 flex-col gap-2">
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {lessons.length === 0 ? (
          <p className="text-pretty px-1 py-4 text-center text-tertiary text-xs">
            No lessons yet. In the knowledge library, drag one from Disciplines
            into {name}, in the {courseName} column.
          </p>
        ) : (
          lessons.map((lesson) => (
            <SortableLessonCard
              key={lesson.id}
              courseId={courseId}
              courseName={courseName}
              lesson={lesson}
              module={mod}
              posterUrl={posters[lesson.id]}
            />
          ))
        )}
      </SortableContext>
    </div>
  );
};
