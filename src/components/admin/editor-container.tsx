import { Accordion } from '@base-ui/react/accordion';
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
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { useRef } from 'react';
import { toast } from 'sonner';
import {
  activeDragLessonIdAtom,
  activeDragLibraryLessonIdAtom,
  activeDragModuleIdAtom,
  editorDragRefusalAtom,
  editorSplitPercentAtom,
  expandedEditorModuleIdsAtom,
} from '#/atoms/admin';
import { dataKeys } from '#/data-hooks/keys';
import { useEditorBoard } from '#/data-hooks/use-editor-board';
import { useLinkLesson } from '#/data-hooks/use-link-lesson';
import { useMovePlacement } from '#/data-hooks/use-move-placement';
import { useOrgLibrary } from '#/data-hooks/use-org-library';
import { useReorderEditorModule } from '#/data-hooks/use-reorder-editor-module';
import type { LibraryLesson, OrgEditorBoard } from '#/lib/admin-schemas';
import { type DndType, parseDndId } from '#/lib/dnd-ids';
import { inlineDirSign } from '#/lib/inline-direction';
import { CourseRail } from './course-rail';
import {
  DisciplineColumnContainer,
  UNTITLED_DISCIPLINE_ID,
} from './discipline-column-container';
import { DragRefusalNote } from './drag-refusal-note';
import {
  boardLessonFromLibrary,
  lessonNeighbours,
  linkLessonOnBoard,
  moduleNeighbours,
  moveLessonOnBoard,
  reorderModulesOnBoard,
} from './editor-board-updates';
import { EditorCourseColumnContainer } from './editor-course-column-container';
import { EditorPaneSplitter } from './editor-pane-splitter';
import { LessonCard } from './lesson-card';
import { LessonLibrary } from './lesson-library';
import { LibraryLessonCard } from './library-lesson-card';
import { ModuleAccordionItem } from './module-accordion-item';
import { resolveDrop } from './resolve-drop';

/** How long a lesson must hover a collapsed module before it opens. */
const AUTO_EXPAND_DELAY_MS = 400;
/** The library pane never shrinks or grows past these, as a % of the editor. */
const MIN_SPLIT_PERCENT = 20;
const MAX_SPLIT_PERCENT = 80;
const SPLIT_KEYBOARD_STEP = 2;

const clampSplit = (percent: number) =>
  Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, percent));

/**
 * The knowledge library editor: the org's lessons on one side, every course's
 * modules on the other, and ONE `DndContext` spanning both.
 *
 * One context is forced by the product: a library lesson has to be draggable
 * into a course column, so the nested-context trick that makes cross-category
 * drags impossible by construction in `sortable-onboarding-category.tsx` is
 * not available. Every rule is therefore a guard — `resolveDrop` — and every
 * refusal says why, out loud, three ways: a note under the cursor, an
 * announcement to screen readers, and a toast if the drop actually lands.
 */
export const EditorContainer = () => {
  const queryClient = useQueryClient();
  const boardKey = dataKeys.editorBoard();

  const { data: library, error: libraryError } = useOrgLibrary();
  const { data: board, error: boardError } = useEditorBoard();

  const [activeModuleId, setActiveModuleId] = useAtom(activeDragModuleIdAtom);
  const [activeLessonId, setActiveLessonId] = useAtom(activeDragLessonIdAtom);
  const [activeLibraryLessonId, setActiveLibraryLessonId] = useAtom(
    activeDragLibraryLessonIdAtom,
  );
  const [refusal, setRefusal] = useAtom(editorDragRefusalAtom);
  const [expandedModuleIds, setExpandedModuleIds] = useAtom(
    expandedEditorModuleIdsAtom,
  );
  const [splitPercent, setSplitPercent] = useAtom(editorSplitPercentAtom);

  const linkLesson = useLinkLesson();
  const movePlacement = useMovePlacement();
  const reorderModule = useReorderEditorModule();

  /**
   * The board as it stood when the drag began. Every optimistic edit below is
   * written straight into the query cache, so this is the only way back: a
   * failed link that leaves the lesson sitting in a course it never reached is
   * worse than one that never looked like it worked.
   */
  const snapshotRef = useRef<OrgEditorBoard | null>(null);
  /** The pending auto-expand, so a drag that moves on cancels it. */
  const expandTimerRef = useRef<{
    moduleId: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  /** The pane row, measured live so the splitter works at any window size. */
  const paneRowRef = useRef<HTMLDivElement>(null);

  const readBoard = () =>
    queryClient.getQueryData<OrgEditorBoard>(boardKey) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /**
   * Collisions are filtered by what is being dragged — but only by KIND, not
   * by rule. A cross-course lesson and a discipline column stay in the
   * candidate set on purpose: filtering them out would make those drags
   * spring back in silence, and a refusal that says nothing is the thing this
   * editor is not allowed to do. They reach `resolveDrop`, which refuses them
   * by name.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const activeType = args.active.data.current?.type as DndType | undefined;

    if (activeType === 'module') {
      // A module only ever lands on another module — including one in another
      // course, which `resolveDrop` then refuses with both course names.
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.data.current?.type === 'module',
        ),
      });
    }

    const targets = args.droppableContainers.filter((c) => {
      const type = c.data.current?.type;
      return type === 'lesson' || type === 'container' || type === 'discipline';
    });
    // Keyboard dragging has no pointer, so the two-stage narrowing below has
    // nothing to narrow with; fall back to plain geometry over every target.
    if (!args.pointerCoordinates) {
      return closestCorners({ ...args, droppableContainers: targets });
    }

    // Stage one: which module or discipline is the pointer actually inside?
    // A module's droppable wraps its whole item, so it would otherwise win
    // `closestCorners` against the smaller lesson cards nested within it and
    // every drop would append instead of landing in the slot under the cursor.
    const areas = targets.filter((c) => {
      const type = c.data.current?.type;
      return type === 'container' || type === 'discipline';
    });
    const hovered = pointerWithin({ ...args, droppableContainers: areas });
    const first = hovered[0];
    if (!first) {
      return closestCorners({ ...args, droppableContainers: areas });
    }

    // Stage two: inside a module, pick the nearest of ITS lessons.
    const parsed = parseDndId(first.id);
    if (parsed?.type === 'container') {
      const lessons = targets.filter(
        (c) =>
          c.data.current?.type === 'lesson' &&
          c.data.current?.moduleId === parsed.id,
      );
      const nearest = closestCorners({
        ...args,
        droppableContainers: lessons,
      });
      if (nearest.length > 0) return nearest;
    }
    return hovered;
  };

  const cancelAutoExpand = () => {
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current.timer);
    expandTimerRef.current = null;
  };

  /**
   * Open a collapsed module after the drag has rested on it.
   *
   * Debounced by module rather than by time alone: a drag crossing a rail of
   * courses passes over many modules, and expanding each one it brushes would
   * reflow the board under the pointer. The timer only survives while the
   * same module stays hovered.
   */
  const scheduleAutoExpand = (moduleId: number) => {
    if (expandTimerRef.current?.moduleId === moduleId) return;
    cancelAutoExpand();
    expandTimerRef.current = {
      moduleId,
      timer: setTimeout(() => {
        expandTimerRef.current = null;
        setExpandedModuleIds((prev) =>
          prev.includes(moduleId) ? prev : [...prev, moduleId],
        );
      }, AUTO_EXPAND_DELAY_MS),
    };
  };

  const rollback = () => {
    if (snapshotRef.current) {
      queryClient.setQueryData(boardKey, snapshotRef.current);
    }
  };

  const clearActive = () => {
    setActiveModuleId(null);
    setActiveLessonId(null);
    setActiveLibraryLessonId(null);
    setRefusal(null);
    cancelAutoExpand();
  };

  const onDragStart = (event: DragStartEvent) => {
    const parsed = parseDndId(event.active.id);
    if (!parsed) return;
    setRefusal(null);
    // Snapshot for every kind of drag, module reorders included: they all
    // write optimistically into the same cached board.
    snapshotRef.current = readBoard();
    if (parsed.type === 'module') setActiveModuleId(parsed.id);
    else if (parsed.type === 'lesson') setActiveLessonId(parsed.id);
    else if (parsed.type === 'library-lesson')
      setActiveLibraryLessonId(parsed.id);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setRefusal(null);
      cancelAutoExpand();
      return;
    }
    const current = readBoard();
    if (!current) return;

    const resolution = resolveDrop(current, active.id, over.id);
    setRefusal(resolution?.kind === 'forbidden' ? resolution.reason : null);

    if (resolution?.kind === 'link' || resolution?.kind === 'move') {
      // Only a drop the editor would actually accept is worth opening a
      // module for. Hovering a course that will refuse the drag should not
      // rearrange that course.
      if (!expandedModuleIds.includes(resolution.moduleId)) {
        scheduleAutoExpand(resolution.moduleId);
      } else {
        cancelAutoExpand();
      }
    } else {
      cancelAutoExpand();
    }

    // Carry a cross-module move live, so the lesson renders where it is going
    // rather than snapping there on release. A same-module reorder is already
    // animated by the sortable and is settled at drop.
    if (resolution?.kind === 'move') {
      const from = current
        .flatMap((cb) => cb.modules)
        .find((m) => m.lessons.some((l) => l.id === resolution.lessonId));
      if (from && from.id !== resolution.moduleId) {
        queryClient.setQueryData(
          boardKey,
          moveLessonOnBoard(
            current,
            resolution.lessonId,
            resolution.moduleId,
            over.id,
          ),
        );
      }
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    clearActive();

    const current = readBoard();
    if (!over || !current) {
      rollback();
      return;
    }

    const resolution = resolveDrop(current, active.id, over.id);
    if (!resolution) {
      // Dropped on nothing recognisable. Undo whatever the drag previewed;
      // there is nothing to explain, because nothing was refused.
      rollback();
      return;
    }

    if (resolution.kind === 'forbidden') {
      rollback();
      toast.error(resolution.reason);
      return;
    }

    if (resolution.kind === 'reorder-module') {
      const next = reorderModulesOnBoard(
        current,
        resolution.moduleId,
        resolution.overModuleId,
      );
      queryClient.setQueryData(boardKey, next);
      reorderModule.mutate(
        {
          moduleId: resolution.moduleId,
          ...moduleNeighbours(next, resolution.moduleId),
        },
        {
          onError: (error) => {
            rollback();
            toast.error(error.message);
          },
        },
      );
      return;
    }

    if (resolution.kind === 'move') {
      const next = moveLessonOnBoard(
        current,
        resolution.lessonId,
        resolution.moduleId,
        resolution.overId,
      );
      queryClient.setQueryData(boardKey, next);
      movePlacement.mutate(
        {
          lessonId: resolution.lessonId,
          targetModuleId: resolution.moduleId,
          ...lessonNeighbours(next, resolution.moduleId, resolution.lessonId),
        },
        {
          onError: (error) => {
            rollback();
            toast.error(error.message);
          },
        },
      );
      return;
    }

    const card = findLibraryLesson(library, resolution.lessonId);
    if (card) {
      queryClient.setQueryData(
        boardKey,
        linkLessonOnBoard(
          current,
          boardLessonFromLibrary(card),
          resolution.moduleId,
        ),
      );
    }
    linkLesson.mutate(
      { moduleId: resolution.moduleId, lessonId: resolution.lessonId },
      {
        onError: (error) => {
          rollback();
          toast.error(error.message);
        },
      },
    );
  };

  const onDragCancel = () => {
    clearActive();
    rollback();
  };

  /**
   * What a screen reader hears. dnd-kit pushes these into its own live
   * region, which is where a refusal's reason has to reach the accessible
   * name — the note under the cursor is invisible to anyone not looking at it.
   */
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      `Picked up ${describeDndTarget(active.id, readBoard(), library)}.`,
    onDragOver: ({
      active,
      over,
    }: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) => {
      const current = readBoard();
      if (!over || !current) return 'No drop target.';
      const resolution = resolveDrop(current, active.id, over.id);
      if (resolution?.kind === 'forbidden') return resolution.reason;
      if (!resolution) return 'Not a drop target.';
      return `Will ${resolution.kind === 'link' ? 'add to' : 'move within'} ${describeDndTarget(over.id, current, library)}.`;
    },
    onDragEnd: ({
      active,
      over,
    }: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) => {
      const current = readBoard();
      if (!over || !current) return 'Dropped with no change.';
      const resolution = resolveDrop(current, active.id, over.id);
      if (resolution?.kind === 'forbidden') return resolution.reason;
      if (!resolution) return 'Dropped with no change.';
      return `Dropped on ${describeDndTarget(over.id, current, library)}.`;
    },
    onDragCancel: () => 'Drag cancelled, nothing moved.',
  };

  const onSplitterPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const row = paneRowRef.current;
    if (!row) return;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = row.getBoundingClientRect();
      if (rect.width === 0) return;
      // Measured from the inline start, not the physical left edge, so the
      // splitter tracks the pointer the same way under RTL.
      const fromStart =
        inlineDirSign() === 1
          ? moveEvent.clientX - rect.left
          : rect.right - moveEvent.clientX;
      setSplitPercent(clampSplit((fromStart / rect.width) * 100));
    };
    const onUp = () => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const onSplitterKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = SPLIT_KEYBOARD_STEP * inlineDirSign();
    if (event.key === 'ArrowLeft') setSplitPercent((p) => clampSplit(p - step));
    else if (event.key === 'ArrowRight')
      setSplitPercent((p) => clampSplit(p + step));
    else if (event.key === 'Home') setSplitPercent(MIN_SPLIT_PERCENT);
    else if (event.key === 'End') setSplitPercent(MAX_SPLIT_PERCENT);
    else return;
    event.preventDefault();
  };

  if (libraryError || boardError) {
    return (
      <p className="p-6 text-error-text text-sm">
        Failed to load the knowledge library.
      </p>
    );
  }
  if (!library || !board) {
    return (
      <p className="p-6 text-sm text-tertiary">
        Loading the knowledge library…
      </p>
    );
  }

  const activeModule = board
    .flatMap((cb) => cb.modules)
    .find((m) => m.id === activeModuleId);
  const activeLesson = board
    .flatMap((cb) => cb.modules)
    .flatMap((m) => m.lessons)
    .find((l) => l.id === activeLessonId);
  const activeLibraryLesson = findLibraryLesson(library, activeLibraryLessonId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      // Droppables are re-measured continuously because auto-expanding a
      // module changes the board's geometry mid-drag; measured once at start,
      // the panel that just opened would still be an invisible 0×0 target.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div ref={paneRowRef} className="flex h-full min-h-0 w-full">
        <div
          className="min-w-0 overflow-hidden"
          style={{ flexBasis: `${splitPercent}%` }}
        >
          <LessonLibrary>
            {library.untitled.length > 0 && (
              <DisciplineColumnContainer
                disciplineId={UNTITLED_DISCIPLINE_ID}
                name="Untitled"
                lessons={library.untitled}
              />
            )}
            {library.disciplines.map((discipline) => (
              <DisciplineColumnContainer
                key={discipline.id}
                disciplineId={discipline.id}
                name={discipline.name}
                lessons={discipline.lessons}
              />
            ))}
          </LessonLibrary>
        </div>

        {/*
          `display: contents` adds no box to this flex row, so the splitter
          still sits between the panes — this wrapper exists only to catch the
          arrow keys bubbling out of it. `EditorPaneSplitter` is presentational
          and takes no key handler, and giving it one would mean editing a
          component another task is reviewing.
        */}
        {/** biome-ignore lint/a11y/noStaticElementInteractions: the interactive element is the child splitter (role="separator", tabIndex 0); this wrapper only relays its bubbled keydown */}
        <div className="contents" onKeyDown={onSplitterKeyDown}>
          <EditorPaneSplitter
            onPointerDown={onSplitterPointerDown}
            ariaValueNow={Math.round(splitPercent)}
          />
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <CourseRail>
            {board.map((courseBoard) => (
              <EditorCourseColumnContainer
                key={courseBoard.course.id}
                courseBoard={courseBoard}
              />
            ))}
          </CourseRail>
        </div>
      </div>

      {/* dropAnimation={null}: the optimistic update has already put the item
          in its final place, so the overlay has nowhere to fly back to. */}
      <DragOverlay dropAnimation={null}>
        {activeModule ? (
          // `Accordion.Item` needs a Root above it, and the overlay renders in
          // its own portal outside the rail's accordion — so it brings one.
          <div className="w-96 rounded-xl border border-gray-6 bg-gray-2">
            <Accordion.Root multiple>
              <ModuleAccordionItem module={activeModule} lessonsSlot={null} />
            </Accordion.Root>
          </div>
        ) : activeLesson ? (
          <LessonCard lesson={activeLesson} />
        ) : activeLibraryLesson ? (
          <LibraryLessonCard lesson={activeLibraryLesson} />
        ) : null}
        {refusal && <DragRefusalNote reason={refusal} />}
      </DragOverlay>
    </DndContext>
  );
};

/** The library card for a lesson id, across disciplines and the untitled column. */
function findLibraryLesson(
  library:
    | { disciplines: { lessons: LibraryLesson[] }[]; untitled: LibraryLesson[] }
    | undefined,
  lessonId: number | null,
): LibraryLesson | undefined {
  if (!library || lessonId == null) return undefined;
  return [
    ...library.untitled,
    ...library.disciplines.flatMap((d) => d.lessons),
  ].find((l) => l.id === lessonId);
}

/** A dnd id as a phrase a screen reader can read back. */
function describeDndTarget(
  id: string | number,
  board: OrgEditorBoard | null,
  library:
    | {
        disciplines: { id: number; name: string; lessons: LibraryLesson[] }[];
        untitled: LibraryLesson[];
      }
    | undefined,
): string {
  const parsed = parseDndId(id);
  if (!parsed) return 'nothing';
  if (parsed.type === 'library-lesson') {
    return `library lesson ${findLibraryLesson(library, parsed.id)?.name ?? parsed.id}`;
  }
  if (parsed.type === 'discipline') {
    const name =
      parsed.id === UNTITLED_DISCIPLINE_ID
        ? 'Untitled'
        : (library?.disciplines.find((d) => d.id === parsed.id)?.name ??
          String(parsed.id));
    return `the ${name} discipline column`;
  }
  if (!board) return String(id);
  if (parsed.type === 'lesson') {
    for (const cb of board) {
      for (const mod of cb.modules) {
        const lesson = mod.lessons.find((l) => l.id === parsed.id);
        if (lesson) return `${lesson.name} in ${mod.name}, ${cb.course.name}`;
      }
    }
    return String(id);
  }
  for (const cb of board) {
    const mod = cb.modules.find((m) => m.id === parsed.id);
    if (mod) return `${mod.name} in ${cb.course.name}`;
  }
  return String(id);
}
