import {
  type CollisionDetection,
  closestCenter,
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
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
import { useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { useRef } from 'react';

import { activeDragLessonIdAtom, activeDragModuleIdAtom } from '@/atoms/admin';
import { dataKeys } from '@/data-hooks/keys';
import { useMoveLesson } from '@/data-hooks/use-move-lesson';
import { useReorderModule } from '@/data-hooks/use-reorder-module';
import type {
  BoardLesson,
  BoardModule,
  CourseBoard,
} from '@/lib/admin-schemas';
import { moduleDndId, parseDndId } from '@/lib/dnd-ids';
import { CreateLessonDialogContainer } from './create-lesson-dialog-container';
import { DeleteLessonDialogContainer } from './delete-lesson-dialog-container';
import { DeleteModuleDialogContainer } from './delete-module-dialog-container';
import { EditLessonDialogContainer } from './edit-lesson-dialog-container';
import { EditModuleDialogContainer } from './edit-module-dialog-container';
import { LessonCard } from './lesson-card';
import { ModuleColumn } from './module-column';
import { SortableModuleColumn } from './sortable-module-column';

/** Which module currently holds the given lesson, or null. */
function findLessonModuleId(
  board: CourseBoard,
  lessonId: number,
): number | null {
  return (
    board.modules.find((m) => m.lessons.some((l) => l.id === lessonId))?.id ??
    null
  );
}

/** Resolve the module a drop target (lesson / container) belongs to. */
function resolveOverModuleId(
  board: CourseBoard,
  overId: string | number,
): number | null {
  const parsed = parseDndId(overId);
  if (!parsed) return null;
  if (parsed.type === 'container' || parsed.type === 'module') return parsed.id;
  return findLessonModuleId(board, parsed.id);
}

/**
 * Return a new board with `lessonId` moved into `targetModuleId` at the position
 * of `overId` (a lesson → its slot; a container → appended).
 *
 * The insert index is the over lesson's index in the target's CURRENT list
 * (with the active lesson still present) — matching arrayMove semantics, so a
 * same-module downward move lands in the right slot rather than one above it.
 */
function placeLesson(
  board: CourseBoard,
  lessonId: number,
  targetModuleId: number,
  overId: string | number,
): CourseBoard {
  const targetModule = board.modules.find((m) => m.id === targetModuleId);
  if (!targetModule) return board;

  const over = parseDndId(overId);
  let overIndex = targetModule.lessons.length;
  if (over?.type === 'lesson') {
    const i = targetModule.lessons.findIndex((l) => l.id === over.id);
    if (i !== -1) overIndex = i;
  }

  let moved: BoardLesson | undefined;
  const withoutLesson = board.modules.map((m) => {
    const idx = m.lessons.findIndex((l) => l.id === lessonId);
    if (idx === -1) return m;
    moved = m.lessons[idx];
    return { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) };
  });
  if (!moved) return board;

  return {
    ...board,
    modules: withoutLesson.map((m) => {
      if (m.id !== targetModuleId) return m;
      const lessons = [...m.lessons];
      lessons.splice(
        Math.min(overIndex, lessons.length),
        0,
        moved as BoardLesson,
      );
      return { ...m, lessons };
    }),
  };
}

export const ModuleBoardContainer = ({
  courseId,
  modules,
}: {
  courseId: number;
  modules: BoardModule[];
}) => {
  const queryClient = useQueryClient();
  const key = dataKeys.courseBoard(courseId);
  const [activeModuleId, setActiveModuleId] = useAtom(activeDragModuleIdAtom);
  const [activeLessonId, setActiveLessonId] = useAtom(activeDragLessonIdAtom);
  const reorderModule = useReorderModule(courseId);
  const moveLesson = useMoveLesson(courseId);
  // Snapshot the board at lesson-drag start so a cancel/error can roll back the
  // optimistic cross-module moves applied during the drag.
  const snapshotRef = useRef<CourseBoard | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const moduleIds = modules.map((m) => moduleDndId(m.id));
  const activeModule = modules.find((m) => m.id === activeModuleId) ?? null;
  const activeLesson =
    activeLessonId != null
      ? (modules
          .flatMap((m) => m.lessons)
          .find((l) => l.id === activeLessonId) ?? null)
      : null;

  // Restrict collisions to droppables matching the dragged item's type, so a
  // dragged lesson never targets a module column and vice versa.
  const collisionDetection: CollisionDetection = (args) => {
    if (args.active.data.current?.type === 'module') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.data.current?.type === 'module',
        ),
      });
    }
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => {
        const t = c.data.current?.type;
        return t === 'lesson' || t === 'container';
      }),
    });
  };

  const onDragStart = (event: DragStartEvent) => {
    const parsed = parseDndId(event.active.id);
    if (!parsed) return;
    if (parsed.type === 'module') {
      setActiveModuleId(parsed.id);
    } else if (parsed.type === 'lesson') {
      snapshotRef.current =
        queryClient.getQueryData<CourseBoard | null>(key) ?? null;
      setActiveLessonId(parsed.id);
    }
  };

  // Move a lesson into a different module mid-drag so it renders there live.
  const onDragOver = (event: DragOverEvent) => {
    if (event.active.data.current?.type !== 'lesson' || !event.over) return;
    const active = parseDndId(event.active.id);
    if (!active) return;
    const board = queryClient.getQueryData<CourseBoard | null>(key);
    if (!board) return;
    const overModuleId = resolveOverModuleId(board, event.over.id);
    const fromModuleId = findLessonModuleId(board, active.id);
    // Same-module reorder is handled by the sortable + onDragEnd.
    if (
      overModuleId == null ||
      fromModuleId == null ||
      fromModuleId === overModuleId
    ) {
      return;
    }
    queryClient.setQueryData(
      key,
      placeLesson(board, active.id, overModuleId, event.over.id),
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const parsed = parseDndId(active.id);

    if (parsed?.type === 'module') {
      setActiveModuleId(null);
      if (!over) return;
      const overParsed = parseDndId(over.id);
      if (
        !overParsed ||
        overParsed.type !== 'module' ||
        overParsed.id === parsed.id
      )
        return;
      const ids = modules.map((m) => m.id);
      const oldIndex = ids.indexOf(parsed.id);
      const newIndex = ids.indexOf(overParsed.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(modules, oldIndex, newIndex);
      const pos = newOrder.findIndex((m) => m.id === parsed.id);
      reorderModule.mutate({
        moduleId: parsed.id,
        prevModuleId: newOrder[pos - 1]?.id ?? null,
        nextModuleId: newOrder[pos + 1]?.id ?? null,
      });
      return;
    }

    if (parsed?.type === 'lesson') {
      setActiveLessonId(null);
      const snapshot = snapshotRef.current;
      if (!over) {
        if (snapshot) queryClient.setQueryData(key, snapshot);
        return;
      }
      const board = queryClient.getQueryData<CourseBoard | null>(key);
      if (!board) return;
      const targetModuleId = resolveOverModuleId(board, over.id);
      if (targetModuleId == null) return;

      const finalBoard = placeLesson(board, parsed.id, targetModuleId, over.id);
      queryClient.setQueryData(key, finalBoard);

      const targetLessons =
        finalBoard.modules.find((m) => m.id === targetModuleId)?.lessons ?? [];
      const idx = targetLessons.findIndex((l) => l.id === parsed.id);
      moveLesson.mutate(
        {
          lessonId: parsed.id,
          targetModuleId,
          prevLessonId: targetLessons[idx - 1]?.id ?? null,
          nextLessonId: targetLessons[idx + 1]?.id ?? null,
        },
        {
          onError: () => {
            if (snapshot) queryClient.setQueryData(key, snapshot);
          },
        },
      );
    }
  };

  const onDragCancel = () => {
    if (activeLessonId != null && snapshotRef.current) {
      queryClient.setQueryData(key, snapshotRef.current);
    }
    setActiveModuleId(null);
    setActiveLessonId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex-1 overflow-auto">
        <div className="flex w-max items-start gap-4 p-4">
          <SortableContext
            items={moduleIds}
            strategy={horizontalListSortingStrategy}
          >
            {modules.map((mod) => (
              <SortableModuleColumn key={mod.id} module={mod} />
            ))}
          </SortableContext>
        </div>
      </div>
      {/* dropAnimation={null}: the optimistic reorder already places the item in
          its final slot, so skip the overlay fly-back. */}
      <DragOverlay dropAnimation={null}>
        {activeModule ? (
          <ModuleColumn module={activeModule} />
        ) : activeLesson ? (
          <LessonCard lesson={activeLesson} />
        ) : null}
      </DragOverlay>
      <CreateLessonDialogContainer courseId={courseId} />
      <EditModuleDialogContainer courseId={courseId} />
      <DeleteModuleDialogContainer courseId={courseId} />
      <EditLessonDialogContainer courseId={courseId} />
      <DeleteLessonDialogContainer courseId={courseId} />
    </DndContext>
  );
};
