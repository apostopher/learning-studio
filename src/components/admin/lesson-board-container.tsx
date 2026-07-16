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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useAtom } from 'jotai';

import { activeDragLessonIdAtom } from '@/atoms/admin';
import { useReorderLesson } from '@/data-hooks/use-reorder-lesson';
import type { BoardLesson } from '@/lib/admin-schemas';
import { LessonCard } from './lesson-card';
import { SortableLessonCard } from './sortable-lesson-card';

/**
 * Drag-to-reorder lessons within a single module. Each module gets its own
 * DndContext so lesson drags stay scoped to their column (cross-module drag is
 * a later step). Mirrors the module-column drag: optimistic reorder + a
 * DragOverlay with dropAnimation disabled.
 */
export const LessonBoardContainer = ({
  courseId,
  moduleId,
  lessons,
}: {
  courseId: number;
  moduleId: number;
  lessons: BoardLesson[];
}) => {
  const [activeId, setActiveId] = useAtom(activeDragLessonIdAtom);
  const reorder = useReorderLesson(courseId, moduleId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (lessons.length === 0) {
    return (
      <p className="px-1 py-4 text-center text-xs text-gray-10">No lessons</p>
    );
  }

  const ids = lessons.map((l) => l.id);
  const activeLesson = lessons.find((l) => l.id === activeId) ?? null;

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

    const newOrder = arrayMove(lessons, oldIndex, newIndex);
    const pos = newOrder.findIndex((l) => l.id === active.id);
    const prev = newOrder[pos - 1] ?? null;
    const next = newOrder[pos + 1] ?? null;
    reorder.mutate({
      lessonId: Number(active.id),
      prevLessonId: prev?.id ?? null,
      nextLessonId: next?.id ?? null,
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
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {lessons.map((lesson) => (
          <SortableLessonCard key={lesson.id} lesson={lesson} />
        ))}
      </SortableContext>
      {/* dropAnimation={null}: the optimistic reorder already places the card in
          its final slot, so skip the overlay fly-back. */}
      <DragOverlay dropAnimation={null}>
        {activeLesson ? <LessonCard lesson={activeLesson} /> : null}
      </DragOverlay>
    </DndContext>
  );
};
