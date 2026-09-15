import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import {
  deleteDisciplineModuleTargetAtom,
  renameDisciplineModuleTargetAtom,
} from '#/atoms/admin';
import type { LibraryDisciplineModule } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import {
  libraryContainerDndId,
  libraryLessonDndId,
  libraryModuleDndId,
} from '#/lib/dnd-ids';
import { LibraryLessonCardContainer } from './library-lesson-card-container';
import { ModuleAccordionItem } from './module-accordion-item';

/**
 * One discipline module in the library column: sortable among its
 * siblings (within the discipline only — `resolveDrop` refuses the rest)
 * and a drop target for library lessons. Same double registration on one
 * wrapper as `EditorModuleContainer`, for the same reason: a collapsed
 * panel has no size, so the whole item is the droppable.
 */
export const LibraryModuleContainer = ({
  module: mod,
  disciplineId,
}: {
  module: LibraryDisciplineModule;
  disciplineId: number;
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
    id: libraryModuleDndId(mod.id),
    data: { type: 'library-module', moduleId: mod.id, disciplineId },
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: libraryContainerDndId(mod.id),
    data: { type: 'library-container', moduleId: mod.id, disciplineId },
  });
  const openRename = useSetAtom(renameDisciplineModuleTargetAtom);
  const openDelete = useSetAtom(deleteDisciplineModuleTargetAtom);

  return (
    <div
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
        onEditModule={() => openRename({ id: mod.id, name: mod.name })}
        onDeleteModule={() =>
          openDelete({
            id: mod.id,
            name: mod.name,
            lessonCount: mod.lessons.length,
          })
        }
        lessonsSlot={
          <SortableContext
            items={mod.lessons.map((l) => libraryLessonDndId(l.id))}
            strategy={verticalListSortingStrategy}
          >
            {mod.lessons.length === 0 ? (
              <p className="px-1 py-3 text-center text-tertiary text-xs">
                Drag lessons here
              </p>
            ) : (
              mod.lessons.map((lesson) => (
                <LibraryLessonCardContainer
                  key={lesson.id}
                  lesson={lesson}
                  disciplineId={disciplineId}
                  boxId={mod.id}
                />
              ))
            )}
          </SortableContext>
        }
      />
    </div>
  );
};
