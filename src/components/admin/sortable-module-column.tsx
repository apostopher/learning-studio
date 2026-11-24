import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its component test.
import { deleteModuleAtom, editModuleAtom } from '#/atoms/admin';
import type { BoardModule } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { moduleDndId } from '#/lib/dnd-ids';
import { BorrowedLessonList } from './borrowed-lesson-list';
import { LessonBoardContainer } from './lesson-board-container';
import { ModuleColumn } from './module-column';
import { moduleProvenance } from './module-provenance';

export const SortableModuleColumn = ({
  courseId,
  courseName,
  module: mod,
  posters,
}: {
  courseId: number;
  courseName: string;
  module: BoardModule;
  posters: Record<string, string>;
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
    id: moduleDndId(courseId, mod.id),
    data: { type: 'module', moduleId: mod.id },
  });
  const setEditModule = useSetAtom(editModuleAtom);
  const setDeleteModule = useSetAtom(deleteModuleAtom);

  // Present exactly when this course doesn't own the module — see
  // `moduleProvenance`. Borrowed modules keep their drag handle (position is
  // THIS course's rail, not the owner's) but lose edit/delete and the
  // DnD-enabled lessons list.
  const provenance = moduleProvenance(mod, courseId);
  const borrowed = provenance !== undefined;

  return (
    <div
      ref={setNodeRef}
      // Only animate the shift while a drag is in progress. After drop, the
      // optimistic reorder already places the column in its final slot, so
      // suppress the transition to avoid the displaced column sliding oddly.
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isSorting ? transition : undefined,
      }}
      className={cn('shrink-0', isDragging && 'opacity-40')}
    >
      <ModuleColumn
        module={mod}
        dragHandleProps={{ ...attributes, ...listeners }}
        provenance={provenance}
        posters={posters}
        onEditModule={
          borrowed
            ? undefined
            : () =>
                setEditModule({
                  id: mod.id,
                  name: mod.name,
                  imageUrlAvif: mod.imageUrlAvif,
                  imageUrlWebp: mod.imageUrlWebp,
                })
        }
        onDeleteModule={
          borrowed
            ? undefined
            : () =>
                setDeleteModule({
                  id: mod.id,
                  name: mod.name,
                  otherCourseCount: mod.otherCourseCount,
                })
        }
        lessonsSlot={
          provenance ? (
            mod.lessons.length === 0 ? (
              <p className="text-pretty px-1 py-4 text-center text-tertiary text-xs">
                No lessons yet. Drag one into {mod.name} in{' '}
                {provenance.ownerName} from Disciplines, in the knowledge
                library.
              </p>
            ) : (
              <BorrowedLessonList
                course={{ id: courseId, name: courseName }}
                lessons={mod.lessons}
                posters={posters}
              />
            )
          ) : (
            <LessonBoardContainer
              courseId={courseId}
              courseName={courseName}
              module={mod}
              posters={posters}
            />
          )
        }
      />
    </div>
  );
};
