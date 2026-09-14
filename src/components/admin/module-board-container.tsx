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
import { useLessonPosters } from '@/data-hooks/use-lesson-posters';
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
import { EditModuleDialogContainer } from './edit-module-dialog-container';
import { LessonCard } from './lesson-card';
import { LessonConfigDialogContainer } from './lesson-config-dialog-container';
import { LessonVideoModalContainer } from './lesson-video-modal-container';
import { ModuleColumn } from './module-column';
import { SortableModuleColumn } from './sortable-module-column';

/**
 * Which of this course's OWN modules holds the given lesson, or null.
 *
 * Own modules only: a borrowed module registers no droppables (its lessons
 * render read-only), so a `lesson` drop-target id can only ever name the
 * course's own copy — and a course can show one lesson twice, in its own
 * module and in a borrowed one, so a search over every module would land on
 * whichever copy comes first.
 */
function findOwnLessonModuleId(
  board: CourseBoard,
  lessonId: number,
): number | null {
  return (
    board.modules.find(
      (m) =>
        m.owner.id === board.course.id &&
        m.lessons.some((l) => l.id === lessonId),
    )?.id ?? null
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
  // Only a placed `lesson` id resolves via lookup; `library-lesson` and
  // `discipline` never appear as drop targets on this board, so treat them
  // as "no module" explicitly rather than falling through into a lesson
  // lookup that would coincidentally find nothing (or, worse, collide).
  if (parsed.type === 'lesson') return findOwnLessonModuleId(board, parsed.id);
  return null;
}

/**
 * Return a new board with `lessonId` moved out of `fromModuleId` into
 * `targetModuleId` at the position of `overId` (a lesson → its slot; a
 * container → appended).
 *
 * Stripped from exactly `fromModuleId` — the module currently showing the
 * dragged card — never from every module holding the lesson: a borrowed
 * module can hold a second copy, and that one is not what is moving.
 *
 * The insert index is the over lesson's index in the target's CURRENT list
 * (with the active lesson still present) — matching arrayMove semantics, so a
 * same-module downward move lands in the right slot rather than one above it.
 */
function placeLesson(
  board: CourseBoard,
  lessonId: number,
  fromModuleId: number,
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
    if (m.id !== fromModuleId) return m;
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
  // One fetch for the whole board. Every tile reads from this map, including
  // both drag overlays below — otherwise a tile greys out the moment it is
  // picked up.
  const { data: posters } = useLessonPosters(courseId);
  const postersById = posters ?? {};
  // Snapshot the board at lesson-drag start so a cancel/error can roll back the
  // optimistic cross-module moves applied during the drag.
  const snapshotRef = useRef<CourseBoard | null>(null);
  /**
   * The lesson drag in flight: the module it was picked up from (`from`,
   * fixed for the drag — the placement the server moves) and the module the
   * board currently shows it in (`holder`, advanced on each live transfer so
   * the next strip pulls the card out of the right module). Tracked rather
   * than searched for by lesson id: a course can show one lesson twice — its
   * own module and a borrowed one — and a search lands on whichever copy
   * comes first. Read from the sortable's `data.moduleId` at drag START:
   * after a live transfer the card re-registers under its new module and
   * dnd-kit's data ref follows it.
   */
  const lessonDragRef = useRef<{
    fromModuleId: number;
    holderModuleId: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const moduleIds = modules.map((m) => moduleDndId(courseId, m.id));
  const activeModule = modules.find((m) => m.id === activeModuleId) ?? null;
  const activeLesson =
    activeLessonId != null
      ? (modules
          .flatMap((m) => m.lessons)
          .find((l) => l.id === activeLessonId) ?? null)
      : null;

  // Restrict collisions to droppables matching the dragged item's type, so a
  // dragged lesson never targets a module column and vice versa.
  //
  // A borrowed module renders no `LessonBoardContainer`, so it registers no
  // `lesson`/`container` droppable at all — that absence is the WHOLE
  // protection against dropping a lesson into it on this board; neither
  // `resolveOverModuleId` nor `placeLesson` carries an explicit borrowed
  // guard.
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
      const moduleId: unknown = event.active.data.current?.moduleId;
      lessonDragRef.current =
        typeof moduleId === 'number'
          ? { fromModuleId: moduleId, holderModuleId: moduleId }
          : null;
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
    const lessonDrag = lessonDragRef.current;
    // Same-module reorder is handled by the sortable + onDragEnd.
    if (
      overModuleId == null ||
      !lessonDrag ||
      lessonDrag.holderModuleId === overModuleId
    ) {
      return;
    }
    queryClient.setQueryData(
      key,
      placeLesson(
        board,
        active.id,
        lessonDrag.holderModuleId,
        overModuleId,
        event.over.id,
      ),
    );
    lessonDrag.holderModuleId = overModuleId;
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
      const lessonDrag = lessonDragRef.current;
      lessonDragRef.current = null;
      if (!over || !lessonDrag) {
        if (snapshot) queryClient.setQueryData(key, snapshot);
        return;
      }
      const board = queryClient.getQueryData<CourseBoard | null>(key);
      if (!board) return;
      const targetModuleId = resolveOverModuleId(board, over.id);
      if (targetModuleId == null) return;

      const finalBoard = placeLesson(
        board,
        parsed.id,
        lessonDrag.holderModuleId,
        targetModuleId,
        over.id,
      );
      queryClient.setQueryData(key, finalBoard);

      const targetLessons =
        finalBoard.modules.find((m) => m.id === targetModuleId)?.lessons ?? [];
      const idx = targetLessons.findIndex((l) => l.id === parsed.id);
      moveLesson.mutate(
        {
          lessonId: parsed.id,
          fromModuleId: lessonDrag.fromModuleId,
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
    lessonDragRef.current = null;
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
        {/* `h-full` gives this row a definite block-size, which
            `.course-board__column`'s `min-block-size: calc(100% - …)` needs
            to resolve against — a percentage against an auto-height parent
            resolves to 0, which would silently collapse every column's
            minimum height. Columns taller than this row (many lessons) still
            grow past it and scroll via the parent's `overflow-auto`. */}
        <div className="flex h-full w-max items-start gap-4 p-4">
          <SortableContext
            items={moduleIds}
            strategy={horizontalListSortingStrategy}
          >
            {modules.map((mod) => (
              <SortableModuleColumn
                key={mod.id}
                courseId={courseId}
                module={mod}
                posters={postersById}
              />
            ))}
          </SortableContext>
        </div>
      </div>
      {/* dropAnimation={null}: the optimistic reorder already places the item in
          its final slot, so skip the overlay fly-back. */}
      <DragOverlay dropAnimation={null}>
        {activeModule ? (
          <ModuleColumn module={activeModule} posters={postersById} />
        ) : activeLesson ? (
          <LessonCard
            lesson={activeLesson}
            posterUrl={postersById[activeLesson.id]}
          />
        ) : null}
      </DragOverlay>
      <CreateLessonDialogContainer courseId={courseId} />
      <EditModuleDialogContainer courseId={courseId} />
      <DeleteModuleDialogContainer courseId={courseId} />
      {/* No `courseId`: a lesson is org-owned and can be taught by several
          courses, so its delete confirmation is not scoped to this board. What
          it needs — including how many courses lose the lesson — rides on
          `deleteLessonAtom`. */}
      <DeleteLessonDialogContainer />
      <LessonConfigDialogContainer courseId={courseId} modules={modules} />
      <LessonVideoModalContainer modules={modules} />
    </DndContext>
  );
};
