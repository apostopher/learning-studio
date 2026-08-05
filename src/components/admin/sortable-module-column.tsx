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

export const SortableModuleColumn = ({
  module: mod,
  posters,
}: {
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
    id: moduleDndId(mod.id),
    data: { type: 'module', moduleId: mod.id },
  });
  const setLessonModuleId = useSetAtom(createLessonModuleIdAtom);
  const setEditModule = useSetAtom(editModuleAtom);
  const setDeleteModule = useSetAtom(deleteModuleAtom);

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
        onAddLesson={() => setLessonModuleId(mod.id)}
        onEditModule={() =>
          setEditModule({
            id: mod.id,
            name: mod.name,
            imageUrlAvif: mod.imageUrlAvif,
            imageUrlWebp: mod.imageUrlWebp,
          })
        }
        onDeleteModule={() => setDeleteModule({ id: mod.id, name: mod.name })}
        lessonsSlot={
          <LessonBoardContainer
            moduleId={mod.id}
            lessons={mod.lessons}
            posters={posters}
          />
        }
      />
    </div>
  );
};
