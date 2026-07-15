import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useAtom } from 'jotai';

import { activeDragModuleIdAtom } from '@/atoms/admin';
import { useReorderModule } from '@/data-hooks/use-reorder-module';
import type { BoardModule } from '@/lib/admin-schemas';
import { ModuleColumn } from './module-column';
import { SortableModuleColumn } from './sortable-module-column';

export const ModuleBoardContainer = ({
  courseId,
  modules,
}: {
  courseId: number;
  modules: BoardModule[];
}) => {
  const [activeId, setActiveId] = useAtom(activeDragModuleIdAtom);
  const reorder = useReorderModule(courseId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = modules.map((m) => m.id);
  const activeModule = modules.find((m) => m.id === activeId) ?? null;

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(Number(active.id));
    const newIndex = ids.indexOf(Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(modules, oldIndex, newIndex);
    const pos = newOrder.findIndex((m) => m.id === active.id);
    const prev = newOrder[pos - 1] ?? null;
    const next = newOrder[pos + 1] ?? null;
    reorder.mutate({
      moduleId: Number(active.id),
      prevModuleId: prev?.id ?? null,
      nextModuleId: next?.id ?? null,
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex-1 overflow-auto">
        <div className="flex w-max items-start gap-4 p-4">
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {modules.map((mod) => (
              <SortableModuleColumn key={mod.id} module={mod} />
            ))}
          </SortableContext>
        </div>
      </div>
      <DragOverlay>
        {activeModule ? <ModuleColumn module={activeModule} /> : null}
      </DragOverlay>
    </DndContext>
  );
};
