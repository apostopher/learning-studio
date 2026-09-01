import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback } from 'react';
import type { EditorBoardModule } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { containerDndId, lessonDndId, moduleDndId } from '#/lib/dnd-ids';
import { DropZoneEmpty } from './drop-zone-empty';
import { EditorLessonCardContainer } from './editor-lesson-card-container';
import { ModuleAccordionItem } from './module-accordion-item';

/**
 * One module in the course rail: sortable among its siblings, and a drop
 * target for lessons.
 *
 * Both dnd registrations sit on the SAME wrapper element, which is the point.
 * The single-course board puts its `container` droppable around the lesson
 * list; here that list lives in an accordion panel, and a closed panel is
 * `hidden`, so its rect is 0×0 and it can never be hit. Wrapping the whole
 * item — trigger row included — gives a collapsed module a droppable with a
 * real size, which is what lets the editor notice a lesson hovering it and
 * expand it.
 */
export const EditorModuleContainer = ({
  module: mod,
  courseId,
  posters,
}: {
  module: EditorBoardModule;
  courseId: number;
  /** Poster frames by lesson id, fetched once per course by the column. */
  posters?: Record<number, string | null>;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isSorting,
    isDragging,
  } = useSortable({
    id: moduleDndId(mod.id),
    data: { type: 'module', moduleId: mod.id, courseId },
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: containerDndId(mod.id),
    data: { type: 'container', moduleId: mod.id, courseId },
  });

  const lessonIds = mod.lessons.map((l) => lessonDndId(l.id));

  return (
    <div
      // Memoised: an inline arrow would be a new ref every render, and React
      // answers a changed ref by calling the old one with null first — which
      // unregisters and re-registers this module as a drop target mid-drag.
      ref={useCallback(
        (node: HTMLDivElement | null) => {
          setSortableRef(node);
          setDroppableRef(node);
        },
        [setSortableRef, setDroppableRef],
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isSorting ? transition : undefined,
      }}
      className={cn(isDragging && 'opacity-40', isOver && 'bg-gray-3')}
    >
      <ModuleAccordionItem
        module={mod}
        dragHandleProps={{ ...attributes, ...listeners }}
        lessonsSlot={
          <SortableContext
            items={lessonIds}
            strategy={verticalListSortingStrategy}
          >
            {mod.lessons.length === 0 ? (
              // A real region rather than a line of text: the module's own
              // droppable already covers this area, so what was missing was
              // somewhere visible to aim at. `isOver` comes from that same
              // droppable, so the outline lights up under a dragged lesson.
              <DropZoneEmpty
                message={`No lessons yet. Drag one from the library into ${mod.name}.`}
                isOver={isOver}
              />
            ) : (
              mod.lessons.map((lesson) => (
                <EditorLessonCardContainer
                  key={lesson.id}
                  lesson={lesson}
                  module={mod}
                  courseId={courseId}
                  posterUrl={posters?.[lesson.id]}
                />
              ))
            )}
          </SortableContext>
        }
      />
    </div>
  );
};
