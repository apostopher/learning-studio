import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import {
  createLessonModuleIdAtom,
  deleteModuleAtom,
  editModuleAtom,
} from '@/atoms/admin';
import type { BoardModule } from '@/lib/admin-schemas';
import { cn } from '@/lib/cn';
import { moduleDndId } from '@/lib/dnd-ids';
import { LessonBoardContainer } from './lesson-board-container';
import { ModuleColumn } from './module-column';
import { moduleProvenance } from './module-provenance';

export const SortableModuleColumn = ({
  courseId,
  module: mod,
  posters,
}: {
  courseId: number;
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
  const setLessonModuleId = useSetAtom(createLessonModuleIdAtom);
  const setEditModule = useSetAtom(editModuleAtom);
  const setDeleteModule = useSetAtom(deleteModuleAtom);

  // Present exactly when this course doesn't own the module — see
  // `moduleProvenance`. Borrowed modules keep their drag handle (position is
  // THIS course's rail, not the owner's) but lose add/edit/delete and the
  // DnD-enabled lessons list: `ModuleColumn`'s static fallback then draws the
  // lessons read-only, straight from `posters`.
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
        onAddLesson={borrowed ? undefined : () => setLessonModuleId(mod.id)}
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
          borrowed ? undefined : (
            <LessonBoardContainer
              courseId={courseId}
              module={mod}
              posters={posters}
            />
          )
        }
      />
    </div>
  );
};
