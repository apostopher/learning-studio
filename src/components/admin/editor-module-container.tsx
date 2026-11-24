import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { removeCourseModuleAtom } from '#/atoms/admin';
import type { EditorBoardModule } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { containerDndId, lessonDndId, moduleDndId } from '#/lib/dnd-ids';
import { BorrowedLessonList } from './borrowed-lesson-list';
import { DropZoneEmpty } from './drop-zone-empty';
import { EditorLessonCardContainer } from './editor-lesson-card-container';
import { ModuleAccordionItem } from './module-accordion-item';
import { moduleProvenance } from './module-provenance';

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
  courseName,
  posters,
  alsoIn,
}: {
  module: EditorBoardModule;
  courseId: number;
  /** Named by the remove control, and by the confirmations opened here. */
  courseName: string;
  /** Poster frames by lesson id, fetched once per course by the column. */
  posters?: Record<number, string | null>;
  /**
   * Lessons this COURSE teaches more than once, with every module holding
   * each (`duplicateLessonNotes`, computed once per column). Filtered down
   * to the OTHER modules before it reaches a card — a card never lists its
   * own module as a duplicate of itself.
   */
  alsoIn: ReadonlyMap<number, string[]>;
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
    id: moduleDndId(courseId, mod.id),
    data: { type: 'module', moduleId: mod.id, courseId },
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: containerDndId(courseId, mod.id),
    data: { type: 'container', moduleId: mod.id, courseId },
  });

  const setRemoveModule = useSetAtom(removeCourseModuleAtom);
  const lessonIds = mod.lessons.map((l) => lessonDndId(courseId, l.id));
  const provenance = moduleProvenance(mod, courseId);
  // Filtered here, once, rather than by each card: a card should never list
  // its own module as a duplicate of itself.
  const alsoInForModule = new Map(
    [...alsoIn].map(([id, names]) => [id, names.filter((n) => n !== mod.name)]),
  );

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
        provenance={provenance}
        // A borrowed module is the OWNER's to remove: here the control stays,
        // inert, and says where it is removed instead of vanishing.
        remove={
          provenance
            ? {
                label: `"${mod.name}" is borrowed from ${provenance.ownerName}. Remove it there, or stop remixing ${provenance.ownerName}`,
              }
            : {
                label: `Remove ${mod.name} from ${courseName}`,
                onClick: () =>
                  setRemoveModule({
                    id: mod.id,
                    name: mod.name,
                    courseId,
                    courseName,
                    otherCourseCount: mod.otherCourseCount,
                  }),
              }
        }
        lessonsSlot={
          provenance ? (
            mod.lessons.length === 0 ? (
              <p className="px-3 py-2 text-tertiary text-xs">
                No lessons yet. Drag one from Disciplines into {mod.name} in{' '}
                {provenance.ownerName}.
              </p>
            ) : (
              <BorrowedLessonList
                course={{ id: courseId, name: courseName }}
                lessons={mod.lessons}
                posters={posters}
                alsoIn={alsoInForModule}
              />
            )
          ) : (
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
                  message={`No lessons yet. Drag one from Disciplines into ${mod.name}.`}
                  isOver={isOver}
                />
              ) : (
                mod.lessons.map((lesson) => (
                  <EditorLessonCardContainer
                    key={lesson.id}
                    lesson={lesson}
                    module={mod}
                    courseId={courseId}
                    courseName={courseName}
                    posterUrl={posters?.[lesson.id]}
                    alsoIn={alsoInForModule.get(lesson.id)}
                  />
                ))
              )}
            </SortableContext>
          )
        }
      />
    </div>
  );
};
