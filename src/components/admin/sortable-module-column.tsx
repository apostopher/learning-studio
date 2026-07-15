import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardModule } from '@/lib/admin-schemas';
import { cn } from '@/lib/cn';
import { ModuleColumn } from './module-column';

export const SortableModuleColumn = ({
  module: mod,
}: {
  module: BoardModule;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isSorting,
    isDragging,
  } = useSortable({ id: mod.id });

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
      />
    </div>
  );
};
