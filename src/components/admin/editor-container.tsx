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
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  activeDragLessonIdAtom,
  activeDragLibraryLessonIdAtom,
  activeDragLibraryModuleIdAtom,
  activeDragModuleIdAtom,
  editorDragRefusalAtom,
  editorPaneRowWidthAtom,
  editorSplitPercentAtom,
  expandedEditorModuleIdsAtom,
  expandedLibraryModuleIdsAtom,
} from '#/atoms/admin';
import { dataKeys } from '#/data-hooks/keys';
import {
  usePlaceLibraryLesson,
  useReorderDisciplineModule,
} from '#/data-hooks/use-discipline-modules';
import { useEditorBoard } from '#/data-hooks/use-editor-board';
import { useLinkLesson } from '#/data-hooks/use-link-lesson';
import { useMovePlacement } from '#/data-hooks/use-move-placement';
import { useOrgLibrary } from '#/data-hooks/use-org-library';
import { useReorderEditorModule } from '#/data-hooks/use-reorder-editor-module';
import {
  disciplineLessons,
  type LibraryLesson,
  type OrgEditorBoard,
  type OrgLibrary,
} from '#/lib/admin-schemas';
import { type DndType, parseDndId } from '#/lib/dnd-ids';
import { courseRailBoards, findFlagshipCourse } from '#/lib/flagship-course';
import { inlineDirSign } from '#/lib/inline-direction';
import {
  commitLibraryDrop,
  type LibraryDropResolution,
  type LibraryPreview,
  libraryDropFromPreview,
} from './commit-library-drop';
import { CourseRail } from './course-rail';
import { CreateCourseDialogContainer } from './create-course-dialog-container';
import { CreateDisciplineDialogContainer } from './create-discipline-dialog-container';
import { CreateDisciplineModuleDialogContainer } from './create-discipline-module-dialog-container';
import { CreateLibraryLessonDialogContainer } from './create-library-lesson-dialog-container';
import { DeleteCourseDialogContainer } from './delete-course-dialog-container';
import { DeleteDisciplineDialogContainer } from './delete-discipline-dialog-container';
import { DeleteDisciplineModuleDialogContainer } from './delete-discipline-module-dialog-container';
import { DeleteLessonDialogContainer } from './delete-lesson-dialog-container';
import {
  DisciplineColumnContainer,
  UNTITLED_DISCIPLINE_ID,
} from './discipline-column-container';
import {
  acceptsLessonDrag,
  acceptsModuleDrag,
  isAreaTarget,
} from './dnd-targets';
import { DragRefusalNote } from './drag-refusal-note';
import { EditCourseDialogContainer } from './edit-course-dialog-container';
import {
  boardLessonFromLibrary,
  commitTransferredLesson,
  lessonNeighbours,
  linkLessonOnBoard,
  moduleNeighbours,
  moveLessonInLibrary,
  moveLessonOnBoard,
  reorderLibraryModules,
  reorderModulesOnBoard,
} from './editor-board-updates';
import { EditorCourseColumnContainer } from './editor-course-column-container';
import { EditorCreateModuleDialogContainer } from './editor-create-module-dialog-container';
import { EditorPaneSplitter } from './editor-pane-splitter';
import { clampSplit, splitBounds } from './editor-split';
import { LessonCard } from './lesson-card';
import { LessonLibrary } from './lesson-library';
import { LessonVideoModalContainer } from './lesson-video-modal-container';
import { LibraryLessonCard } from './library-lesson-card';
import { LibraryLessonConfigDialogContainer } from './library-lesson-config-dialog-container';
import { ModuleAccordionItem } from './module-accordion-item';
import { RenameDisciplineDialogContainer } from './rename-discipline-dialog-container';
import { RenameDisciplineModuleDialogContainer } from './rename-discipline-module-dialog-container';
import { type DragOrigin, resolveDrop } from './resolve-drop';
import { UnremixCourseDialogContainer } from './unremix-course-dialog-container';

/** How long a lesson must hover a collapsed module before it opens. */
const AUTO_EXPAND_DELAY_MS = 400;
/**
 * How far outside a target still counts as aiming at it. Measured edge to
 * pointer, not centre to centre: a tall module's centre can be 200px from its
 * own bottom edge, so a centre-distance threshold would call a drop just below
 * it a miss while calling a drop across the pane a hit.
 */
const DROP_SLOP_PX = 24;
const SPLIT_KEYBOARD_STEP = 2;

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
/**
 * What this actor may CREATE from the editor, read off the route context —
 * the only place holding global permissions.
 *
 * Both actions are org-level and neither has a course- or discipline-scoped
 * fallback, which is why they are booleans rather than per-column flags:
 * `POST /api/admin/disciplines` is `requireAdmin` (an admin hires the
 * experts; an expert authors and does not administer), and creating a course
 * is the `course:create` permission. The screen itself admits a wider
 * population than either — course staff and discipline SMEs read it too — so
 * a caller holding neither gets no button rather than a disabled one.
 */
export interface EditorCapabilities {
  /**
   * RBAC rule 1 — may CREATE a discipline: a course manager, a subject expert
   * or an admin. Mirrors `requireDisciplineCreation`.
   */
  canCreateDiscipline: boolean;
  /**
   * May RENAME or DELETE a discipline — admin only, and a separate flag from
   * creation precisely because the two rules differ. Both carry the same
   * server guard (`requireAdmin`), so one flag covers both.
   *
   * Adding a LESSON to a discipline is deliberately NOT covered by either:
   * that is authoring, guarded by `requireLessonContentPermission`, and
   * whether this actor holds it for a PARTICULAR discipline is a question the
   * router context cannot answer. The control is offered and the server
   * refuses if it must.
   */
  canManageDisciplines: boolean;
  /** RBAC rule 5 — a course manager or an admin. Mirrors `requireCourseCreation`. */
  canCreateCourse: boolean;
  /**
   * `course:update` and `course:delete`. Both org-level with no course-scoped
   * fallback, which is why the route can answer them for the whole rail at
   * once — unlike adding a MODULE, which is course-scoped `structure` work and
   * is therefore offered to everyone and refused by the server if it must be.
   */
  canEditCourse: boolean;
  canDeleteCourse: boolean;
}

export const EditorContainer = ({
  capabilities,
}: {
  capabilities: EditorCapabilities;
}) => {
  const queryClient = useQueryClient();
  const boardKey = dataKeys.editorBoard();
  const libraryKey = dataKeys.orgLibrary();

  const { data: library, error: libraryError } = useOrgLibrary();
  const { data: board, error: boardError } = useEditorBoard();

  const [activeModuleId, setActiveModuleId] = useAtom(activeDragModuleIdAtom);
  const [activeLessonId, setActiveLessonId] = useAtom(activeDragLessonIdAtom);
  const [activeLibraryLessonId, setActiveLibraryLessonId] = useAtom(
    activeDragLibraryLessonIdAtom,
  );
  const [activeLibraryModuleId, setActiveLibraryModuleId] = useAtom(
    activeDragLibraryModuleIdAtom,
  );
  const [refusal, setRefusal] = useAtom(editorDragRefusalAtom);
  const [expandedModuleIds, setExpandedModuleIds] = useAtom(
    expandedEditorModuleIdsAtom,
  );
  const [expandedLibraryModuleIds, setExpandedLibraryModuleIds] = useAtom(
    expandedLibraryModuleIdsAtom,
  );
  const [splitPercent, setSplitPercent] = useAtom(editorSplitPercentAtom);

  const linkLesson = useLinkLesson();
  const movePlacement = useMovePlacement();
  const reorderModule = useReorderEditorModule();
  const placeLibraryLesson = usePlaceLibraryLesson();
  const reorderDisciplineModule = useReorderDisciplineModule();

  /**
   * The board as it stood when the drag began. Every optimistic edit below is
   * written straight into the query cache, so this is the only way back: a
   * failed link that leaves the lesson sitting in a course it never reached is
   * worse than one that never looked like it worked.
   */
  const snapshotRef = useRef<OrgEditorBoard | null>(null);
  /**
   * The library as it stood when the drag began — the library-side sibling of
   * `snapshotRef`, restored by the same `rollback`. A library-lesson or
   * library-module drag writes its live preview straight into this query's
   * cache too (`moveLessonInLibrary`/`reorderLibraryModules`), so a failed
   * mutation or a genuine miss needs this to undo it, exactly as `snapshotRef`
   * undoes a board-side preview.
   */
  const librarySnapshotRef = useRef<OrgLibrary | null>(null);
  /**
   * The last library-side preview `onDragOver` actually applied to the
   * cache — the library-side sibling of `lessonDragRef.holderModuleId`. Set
   * whenever `moveLessonInLibrary`/`reorderLibraryModules` runs, read by
   * `onDragEnd` to rebuild the resolution when the drag is released exactly
   * on its own (already-relocated) card — see `libraryDropFromPreview`.
   * Cleared at the start of every drag and once `onDragEnd`/`onDragCancel`
   * are done with it (via `clearActive`).
   */
  const libraryPreviewRef = useRef<LibraryPreview | null>(null);
  /**
   * Set once `onDragOver` has transferred the dragged lesson into another
   * module. The transferred card becomes a droppable of its own, so the
   * release can land on the dragged lesson's own id — a self-drop, which
   * `resolveDrop` answers `null` for. Without this flag that `null` would roll
   * the transfer back and the drag would appear to have done nothing.
   */
  const transferAppliedRef = useRef(false);
  /**
   * The lesson drag in flight: where it was picked up (`origin`, fixed for
   * the drag — the placement the server moves, and whose owner it guards)
   * and where the board currently shows it (`holderModuleId`, advanced on
   * each live transfer so the next strip pulls the card out of the right
   * module). Both are tracked rather than searched for by lesson id: a
   * course can show one lesson twice — its own module and a borrowed one —
   * and a search lands on whichever copy comes first. Read from the
   * sortable's `data.moduleId` at drag START, not later: after a live
   * transfer the card re-registers under its new module and dnd-kit's data
   * ref follows it.
   */
  const lessonDragRef = useRef<{
    origin: DragOrigin;
    holderModuleId: number;
  } | null>(null);
  /** The pending auto-expand, so a drag that moves on cancels it. */
  const expandTimerRef = useRef<{
    moduleId: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  /**
   * The pending auto-expand for a LIBRARY module — a second ref rather than
   * reusing `expandTimerRef`, because the two are keyed on different id
   * spaces (course modules vs discipline modules) and open different atoms
   * (`expandedEditorModuleIdsAtom` vs `expandedLibraryModuleIdsAtom`). Mixing
   * them would risk a discipline module id colliding with a course module id
   * and expanding the wrong one.
   */
  const libraryExpandTimerRef = useRef<{
    moduleId: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  /** The pane row, measured live so the splitter works at any window size. */
  const paneRowRef = useRef<HTMLDivElement>(null);
  const [paneRowWidth, setPaneRowWidth] = useAtom(editorPaneRowWidthAtom);

  const readBoard = () =>
    queryClient.getQueryData<OrgEditorBoard>(boardKey) ?? null;
  const readLibrary = () =>
    queryClient.getQueryData<OrgLibrary>(libraryKey) ?? null;

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
   *
   * What IS filtered out is the drop that means nothing: `closestCenter` and
   * `closestCorners` answer with the nearest candidate at ANY distance, so
   * without a miss gate there is no such thing as releasing over nothing.
   * Every "never mind" would snap to whatever happened to be closest — a
   * module let go over the library pane would quietly reorder itself, and a
   * card let go in blank space would raise a red toast. Escape must not be
   * the only way to cancel a drag.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const activeData = args.active.data.current;
    const activeType = activeData?.type as DndType | undefined;
    const pointer = args.pointerCoordinates;
    const missed = (candidates: typeof args.droppableContainers) =>
      pointer != null &&
      !candidates.some((c) =>
        pointerIsNear(args.droppableRects.get(c.id), pointer),
      );

    if (activeType === 'module') {
      // A module lands on another module — including one in another course,
      // which `resolveDrop` refuses with both course names.
      //
      // The library columns and empty-course zones are candidates too, and
      // that is the point: a module dragged onto either is a real attempt at
      // something this pane does not do, and `resolveDrop` has a sentence for
      // each. Filtered down to modules alone — as this was — `over` came back
      // null for those drops, so the drag sprang back with no note, no
      // announcement and no toast, which is the silent failure the whole
      // refusal design exists to prevent. Two of `resolveDrop`'s branches
      // were unreachable as a result, while their tests passed.
      const moduleTargets = args.droppableContainers.filter((c) =>
        acceptsModuleDrag(c.data.current?.type as DndType | undefined),
      );
      if (missed(moduleTargets)) return [];
      return closestCenter({ ...args, droppableContainers: moduleTargets });
    }

    if (activeType === 'library-module') {
      // Every droppable is a candidate except the drag's OWN discipline
      // column — the same rule `library-lesson` drags use below (a card
      // released back on the column it came from is "never mind", not a
      // mistake). Nothing else is filtered by kind, on purpose:
      // `resolveDrop` refuses EVERY rail target ("organises the library, not
      // a course") and every cross-discipline library target (naming both
      // disciplines) — a refusal has to be reachable to be a refusal, the
      // same reasoning `acceptsModuleDrag` documents for the rail's own
      // module drags. An earlier version of this filter kept only the rail's
      // `module`/`course` ids and excluded cross-discipline library
      // lesson/container ids, which made both of those refusals
      // unreachable through a course module's per-slot droppables or a
      // sibling discipline's lesson cards — springing the drag back with no
      // note, no announcement and no toast.
      const disciplineId = activeData?.disciplineId as number | undefined;
      const libraryModuleTargets = args.droppableContainers.filter((c) => {
        const type = c.data.current?.type as DndType | undefined;
        if (type === 'discipline') {
          return c.data.current?.disciplineId !== disciplineId;
        }
        return true;
      });
      if (missed(libraryModuleTargets)) return [];
      return closestCenter({
        ...args,
        droppableContainers: libraryModuleTargets,
      });
    }

    const targets = args.droppableContainers.filter((c) => {
      const type = c.data.current?.type as DndType | undefined;
      if (type === 'discipline') {
        // A library card released back on the column it came from is "never
        // mind", not a mistake — the same reasoning that makes a self-drop
        // `null` rather than `forbidden` in `resolveDrop`. Dropping it on a
        // DIFFERENT discipline column is a real attempt at something this
        // pane does not do, so that one stays a target and gets its reason.
        return !(
          activeType === 'library-lesson' &&
          c.data.current?.disciplineId === activeData?.disciplineId
        );
      }
      if (
        type === 'library-module' ||
        type === 'library-container' ||
        type === 'library-untitled' ||
        type === 'library-lesson'
      ) {
        // Not `discipline` ids, so they pass through here unchanged — a
        // library-lesson drag's real targets (`resolveDrop` files it into a
        // module, Untitled, or refuses a cross-discipline one by name), and a
        // harmless miss for anything else (`resolveDrop` answers those
        // `null`, same as dropping on nothing).
        return true;
      }
      // `course` is the empty-course region. It is a target so the drop can
      // be refused BY NAME rather than springing back silently — see
      // `EditorCourseEmptyContainer`.
      return acceptsLessonDrag(type);
    });
    // Keyboard dragging has no pointer, so the two-stage narrowing below has
    // nothing to narrow with; fall back to plain geometry over every target.
    if (!pointer) {
      return closestCorners({ ...args, droppableContainers: targets });
    }

    // Stage one: which module or discipline is the pointer actually inside?
    // A module's droppable wraps its whole item, so it would otherwise win
    // `closestCorners` against the smaller lesson cards nested within it and
    // every drop would append instead of landing in the slot under the cursor.
    const areas = targets.filter((c) =>
      isAreaTarget(c.data.current?.type as DndType | undefined),
    );
    if (missed(areas)) return [];
    const hovered = pointerWithin({ ...args, droppableContainers: areas });
    const first = hovered[0];
    if (!first) {
      return closestCorners({ ...args, droppableContainers: areas });
    }

    // Stage two: inside a module, pick the nearest of ITS lessons.
    const parsed = parseDndId(first.id);
    if (parsed?.type === 'container') {
      // A remixed module's container is hit twice on the board — once per
      // course column it appears in — so `moduleId` alone is not enough to
      // pick out THIS column's lessons; `courseId` disambiguates them.
      const lessons = targets.filter(
        (c) =>
          c.data.current?.type === 'lesson' &&
          c.data.current?.moduleId === parsed.id &&
          c.data.current?.courseId === parsed.courseId,
      );
      const nearest = closestCorners({
        ...args,
        droppableContainers: lessons,
      });
      if (nearest.length > 0) return nearest;
    } else if (parsed?.type === 'library-container') {
      // The library's analogue of `container` above — a discipline module is
      // never remixed, so its id alone (no course to disambiguate) already
      // picks out its own lessons.
      const lessons = targets.filter(
        (c) =>
          c.data.current?.type === 'library-lesson' &&
          c.data.current?.disciplineModuleId === parsed.id,
      );
      const nearest = closestCorners({
        ...args,
        droppableContainers: lessons,
      });
      if (nearest.length > 0) return nearest;
    } else if (parsed?.type === 'library-untitled') {
      const lessons = targets.filter(
        (c) =>
          c.data.current?.type === 'library-lesson' &&
          c.data.current?.disciplineModuleId === null &&
          c.data.current?.disciplineId === parsed.id,
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

  /** The library-module sibling of `cancelAutoExpand` — see `libraryExpandTimerRef`. */
  const cancelLibraryAutoExpand = () => {
    if (libraryExpandTimerRef.current) {
      clearTimeout(libraryExpandTimerRef.current.timer);
    }
    libraryExpandTimerRef.current = null;
  };

  // The auto-expand timer is scheduled by `scheduleAutoExpand` during a drag
  // and otherwise cleared by `cancelAutoExpand`/`clearActive` — but a drag can
  // still be in flight when the editor itself unmounts (navigating away
  // mid-drag), and nothing above runs then. Without this, the timeout fires
  // after unmount and calls `setExpandedModuleIds` (a jotai setter, not a
  // React state setter, so it wouldn't warn) against a board that is no
  // longer on screen — a real, if small, leak.
  useEffect(() => {
    // Not `cancelAutoExpand` directly: that closure is redefined every render
    // (it isn't memoized), so passing it here would need it in the dependency
    // array, re-running the effect — and thus tearing down/re-adding this
    // cleanup — on every render for no reason. Reading `expandTimerRef`
    // directly needs no dependency at all, since refs are stable identity.
    return () => {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current.timer);
      if (libraryExpandTimerRef.current) {
        clearTimeout(libraryExpandTimerRef.current.timer);
      }
    };
  }, []);

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

  /** The library-module sibling of `scheduleAutoExpand` — opens a collapsed
   *  DISCIPLINE module through `expandedLibraryModuleIdsAtom` instead of the
   *  rail's atom. Never share `expandTimerRef`/`expandedModuleIds` with this:
   *  the two id spaces (course modules, discipline modules) are unrelated
   *  tables and a shared list would risk expanding the wrong one. */
  const scheduleLibraryAutoExpand = (moduleId: number) => {
    if (libraryExpandTimerRef.current?.moduleId === moduleId) return;
    cancelLibraryAutoExpand();
    libraryExpandTimerRef.current = {
      moduleId,
      timer: setTimeout(() => {
        libraryExpandTimerRef.current = null;
        setExpandedLibraryModuleIds((prev) =>
          prev.includes(moduleId) ? prev : [...prev, moduleId],
        );
      }, AUTO_EXPAND_DELAY_MS),
    };
  };

  /**
   * Restores a SPECIFIC snapshot, passed in by the caller — never reads
   * `snapshotRef.current` itself. `snapshotRef` is one shared slot, but a
   * drag's `mutate(...).onError` callback can still fire after a SECOND drag
   * has already begun and overwritten that slot with its own pre-drag board
   * (which, if the first drag's optimistic write already landed, now
   * contains the first drag's write baked in as "the board before"). Reading
   * the live ref at that point would restore the second drag's snapshot —
   * which does not undo the first drag's failed write, it cements it. Every
   * caller below captures its own drag's snapshot into a local `const` at
   * the top of `onDragEnd`/`onDragCancel` and threads that value through, so
   * a later drag overwriting the ref cannot affect an in-flight rollback that
   * belongs to an earlier one.
   *
   * `librarySnapshot` is the library-side twin of `snapshot`, restored the
   * same way and for the same reason — a library-lesson/library-module drag's
   * live preview is written into the library query's cache, never the
   * board's, so undoing it means restoring THAT cache.
   */
  const rollback = (
    snapshot: OrgEditorBoard | null,
    librarySnapshot: OrgLibrary | null,
  ) => {
    if (snapshot) {
      queryClient.setQueryData(boardKey, snapshot);
    }
    if (librarySnapshot) {
      queryClient.setQueryData(libraryKey, librarySnapshot);
    }
  };

  const clearActive = () => {
    transferAppliedRef.current = false;
    // `lessonDragRef` is deliberately NOT cleared here: dnd-kit fires the
    // accessibility announcements AFTER the `onDragEnd` prop, and the
    // announcement re-resolves the drop with the same origin. The next
    // lesson drag overwrites it at start; nothing but a lesson drag reads it.
    //
    // `libraryPreviewRef` IS cleared here — unlike `lessonDragRef`, nothing
    // reads it after `onDragEnd`/`onDragCancel` are done with it (the
    // announcements re-resolve independently, never through the preview
    // rescue), and both callers capture it into a local before calling this.
    libraryPreviewRef.current = null;
    setActiveModuleId(null);
    setActiveLessonId(null);
    setActiveLibraryLessonId(null);
    setActiveLibraryModuleId(null);
    setRefusal(null);
    cancelAutoExpand();
    cancelLibraryAutoExpand();
  };

  const onDragStart = (event: DragStartEvent) => {
    const parsed = parseDndId(event.active.id);
    if (!parsed) return;
    setRefusal(null);
    transferAppliedRef.current = false;
    libraryPreviewRef.current = null;
    // Snapshot for every kind of drag, module reorders included: they all
    // write optimistically into the same cached board — and the library,
    // for the same reason, since a library-lesson/library-module drag
    // previews into that cache instead.
    snapshotRef.current = readBoard();
    librarySnapshotRef.current = readLibrary();
    if (parsed.type === 'module') setActiveModuleId(parsed.id);
    else if (parsed.type === 'lesson') {
      setActiveLessonId(parsed.id);
      const moduleId: unknown = event.active.data.current?.moduleId;
      lessonDragRef.current =
        typeof moduleId === 'number'
          ? { origin: { moduleId }, holderModuleId: moduleId }
          : null;
    } else if (parsed.type === 'library-lesson')
      setActiveLibraryLessonId(parsed.id);
    else if (parsed.type === 'library-module')
      setActiveLibraryModuleId(parsed.id);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setRefusal(null);
      cancelAutoExpand();
      cancelLibraryAutoExpand();
      return;
    }
    const current = readBoard();
    if (!current) return;
    const currentLibrary = readLibrary();

    const lessonDrag = lessonDragRef.current;
    const resolution = resolveDrop(
      current,
      active.id,
      over.id,
      lessonDrag?.origin,
      currentLibrary ?? undefined,
    );
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

    // The library-module sibling of the rail's auto-expand above: only a
    // `library-move` landing INSIDE a module (never Untitled, which has no
    // accordion to open) is worth opening one for.
    if (
      resolution?.kind === 'library-move' &&
      resolution.disciplineModuleId != null
    ) {
      const targetModuleId = resolution.disciplineModuleId;
      if (!expandedLibraryModuleIds.includes(targetModuleId)) {
        scheduleLibraryAutoExpand(targetModuleId);
      } else {
        cancelLibraryAutoExpand();
      }
    } else {
      cancelLibraryAutoExpand();
    }

    // Carry a cross-module move live, so the lesson renders where it is going
    // rather than snapping there on release. A same-module reorder is already
    // animated by the sortable and is settled at drop.
    if (
      resolution?.kind === 'move' &&
      lessonDrag &&
      lessonDrag.holderModuleId !== resolution.moduleId
    ) {
      queryClient.setQueryData(
        boardKey,
        moveLessonOnBoard(
          current,
          resolution.lessonId,
          lessonDrag.holderModuleId,
          resolution.moduleId,
          over.id,
        ),
      );
      lessonDrag.holderModuleId = resolution.moduleId;
      transferAppliedRef.current = true;
    }

    // The library-side live preview — written to the LIBRARY query, never the
    // board's, so a lesson (or a discipline module) renders where it is
    // going without waiting for the drop. `moveLessonInLibrary` handles a
    // same-box hover (a reorder within a module) the same way it handles a
    // cross-box one; there is nothing here to special-case.
    //
    // `libraryPreviewRef` records what was just applied — never the ever-
    // changing `overId`/`overModuleId`, only what identifies the card and
    // where it landed — so `onDragEnd` can rebuild this exact resolution if
    // the drag is released on the card's own (now-relocated) droppable. See
    // `libraryDropFromPreview`.
    if (resolution?.kind === 'library-move' && currentLibrary) {
      queryClient.setQueryData(
        libraryKey,
        moveLessonInLibrary(
          currentLibrary,
          resolution.lessonId,
          resolution.disciplineModuleId,
          over.id,
        ),
      );
      libraryPreviewRef.current = {
        kind: 'library-move',
        lessonId: resolution.lessonId,
        disciplineId: resolution.disciplineId,
        disciplineModuleId: resolution.disciplineModuleId,
      };
    } else if (
      resolution?.kind === 'reorder-library-module' &&
      currentLibrary
    ) {
      queryClient.setQueryData(
        libraryKey,
        reorderLibraryModules(
          currentLibrary,
          resolution.disciplineId,
          resolution.moduleId,
          resolution.overModuleId,
        ),
      );
      libraryPreviewRef.current = {
        kind: 'reorder-library-module',
        disciplineId: resolution.disciplineId,
        moduleId: resolution.moduleId,
      };
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    // Both read before `clearActive`, which resets `transferAppliedRef` (but
    // not `snapshotRef` — this is the only place THIS drag's snapshot is
    // captured, since `snapshotRef.current` can be overwritten by a new
    // drag's `onDragStart` before this drag's async mutation settles). Every
    // `rollback` call below — sync and inside an `onError` closure alike —
    // uses this local constant, never `snapshotRef.current` directly.
    // `dragLibrarySnapshot` is the library-side twin, threaded through the
    // same way for the same reason.
    const transferApplied = transferAppliedRef.current;
    const dragSnapshot = snapshotRef.current;
    const dragLibrarySnapshot = librarySnapshotRef.current;
    const libraryPreview = libraryPreviewRef.current;
    const lessonDrag = lessonDragRef.current;
    clearActive();

    const current = readBoard();
    if (!over || !current) {
      // A genuine miss — released over no target at all. That is the "never
      // mind" gesture, so it cancels: undo the preview, say nothing.
      rollback(dragSnapshot, dragLibrarySnapshot);
      return;
    }
    const currentLibrary = readLibrary();

    /**
     * Commits a `library-move`/`reorder-library-module` resolution — shared
     * by the ordinary path below and the self-drop rescue, so the mutation
     * and its rollback are written once.
     */
    const commitLibraryResolution = (
      libraryResolution: LibraryDropResolution,
      lib: OrgLibrary,
    ) => {
      const commit = commitLibraryDrop(libraryResolution, lib);
      if (commit.kind === 'place') {
        placeLibraryLesson.mutate(commit.vars, {
          onError: (error) => {
            rollback(dragSnapshot, dragLibrarySnapshot);
            toast.error(error.message);
          },
        });
      } else {
        reorderDisciplineModule.mutate(commit.vars, {
          onError: (error) => {
            rollback(dragSnapshot, dragLibrarySnapshot);
            toast.error(error.message);
          },
        });
      }
    };

    const activeParsed = parseDndId(active.id);
    const resolution = resolveDrop(
      current,
      active.id,
      over.id,
      lessonDrag?.origin,
      currentLibrary ?? undefined,
    );
    if (!resolution) {
      // `null` is "no drop target", which is usually a rollback. The
      // exceptions are a lesson (or a library lesson/module) released on
      // ITSELF after `onDragOver` already carried it elsewhere: the
      // transferred card is a droppable, so it can win the collision, and
      // undoing there would throw away a move the admin watched happen and
      // released on deliberately.
      if (activeParsed?.type === 'lesson' && lessonDrag) {
        const commit = commitTransferredLesson(
          current,
          activeParsed.id,
          lessonDrag.holderModuleId,
          transferApplied,
        );
        if (commit) {
          movePlacement.mutate(
            {
              lessonId: activeParsed.id,
              fromModuleId: lessonDrag.origin.moduleId,
              targetModuleId: commit.targetModuleId,
              prevLessonId: commit.prevLessonId,
              nextLessonId: commit.nextLessonId,
            },
            {
              onError: (error) => {
                rollback(dragSnapshot, dragLibrarySnapshot);
                toast.error(error.message);
              },
            },
          );
          return;
        }
      }
      // The library-side twin of the rescue above — see `libraryPreviewRef`
      // and `libraryDropFromPreview`. Matched by id, so a preview left over
      // from an earlier hover (or nothing at all) still rolls back.
      const rescued = libraryDropFromPreview(
        libraryPreview,
        active.id,
        over.id,
      );
      if (rescued && currentLibrary) {
        commitLibraryResolution(rescued, currentLibrary);
        return;
      }
      rollback(dragSnapshot, dragLibrarySnapshot);
      return;
    }

    if (resolution.kind === 'forbidden') {
      // Covers a library-side refusal too — see `rollback`: restoring the
      // library snapshot is a no-op when this drag never touched it.
      rollback(dragSnapshot, dragLibrarySnapshot);
      toast.error(resolution.reason);
      return;
    }

    if (resolution.kind === 'reorder-module') {
      const next = reorderModulesOnBoard(
        current,
        resolution.courseId,
        resolution.moduleId,
        resolution.overModuleId,
      );
      queryClient.setQueryData(boardKey, next);
      reorderModule.mutate(
        {
          moduleId: resolution.moduleId,
          courseId: resolution.courseId,
          ...moduleNeighbours(next, resolution.courseId, resolution.moduleId),
        },
        {
          onError: (error) => {
            rollback(dragSnapshot, dragLibrarySnapshot);
            toast.error(error.message);
          },
        },
      );
      return;
    }

    if (resolution.kind === 'move') {
      // `lessonDrag` is set for every lesson drag `resolveDrop` can answer
      // `move` to — it refuses one without an origin — so this is a type
      // narrowing, not a reachable branch.
      if (!lessonDrag) {
        rollback(dragSnapshot, dragLibrarySnapshot);
        return;
      }
      const next = moveLessonOnBoard(
        current,
        resolution.lessonId,
        lessonDrag.holderModuleId,
        resolution.moduleId,
        resolution.overId,
      );
      queryClient.setQueryData(boardKey, next);
      movePlacement.mutate(
        {
          lessonId: resolution.lessonId,
          fromModuleId: resolution.fromModuleId,
          targetModuleId: resolution.moduleId,
          ...lessonNeighbours(next, resolution.moduleId, resolution.lessonId),
        },
        {
          onError: (error) => {
            rollback(dragSnapshot, dragLibrarySnapshot);
            toast.error(error.message);
          },
        },
      );
      return;
    }

    if (
      resolution.kind === 'library-move' ||
      resolution.kind === 'reorder-library-module'
    ) {
      // Read off the PREVIEWED library, not the drag-start snapshot: the
      // neighbours sent to the server must be the ones `onDragOver` already
      // showed the admin, or the persisted order would disagree with what
      // they watched happen. `currentLibrary` above is that same read, taken
      // before anything in this branch writes to the cache again.
      if (!currentLibrary) {
        rollback(dragSnapshot, dragLibrarySnapshot);
        return;
      }
      commitLibraryResolution(resolution, currentLibrary);
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
          rollback(dragSnapshot, dragLibrarySnapshot);
          toast.error(error.message);
        },
      },
    );
  };

  const onDragCancel = () => {
    // Synchronous and scoped to the drag currently in progress — no other
    // drag can have started yet to overwrite `snapshotRef.current` here —
    // but captured into a local for the same reason as `onDragEnd`: so
    // `rollback` never reads the shared ref directly.
    const dragSnapshot = snapshotRef.current;
    const dragLibrarySnapshot = librarySnapshotRef.current;
    clearActive();
    rollback(dragSnapshot, dragLibrarySnapshot);
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
      const currentLibrary = readLibrary();
      if (!over || !current) return 'No drop target.';
      const resolution = resolveDrop(
        current,
        active.id,
        over.id,
        lessonDragRef.current?.origin,
        currentLibrary ?? undefined,
      );
      if (resolution?.kind === 'forbidden') return resolution.reason;
      if (!resolution) return 'Not a drop target.';
      if (resolution.kind === 'library-move') {
        return `Will file in ${describeDndTarget(over.id, current, currentLibrary ?? undefined)}.`;
      }
      return `Will ${resolution.kind === 'link' ? 'add to' : 'move within'} ${describeDndTarget(over.id, current, currentLibrary ?? undefined)}.`;
    },
    onDragEnd: ({
      active,
      over,
    }: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) => {
      const current = readBoard();
      const currentLibrary = readLibrary();
      if (!over || !current) return 'Dropped with no change.';
      const resolution = resolveDrop(
        current,
        active.id,
        over.id,
        lessonDragRef.current?.origin,
        currentLibrary ?? undefined,
      );
      if (resolution?.kind === 'forbidden') return resolution.reason;
      if (!resolution) return 'Dropped with no change.';
      return `Dropped on ${describeDndTarget(over.id, current, currentLibrary ?? undefined)}.`;
    },
    onDragCancel: () => 'Drag cancelled, nothing moved.',
  };

  /**
   * The splitter's bounds are pixel floors — one column plus its gutters on
   * each side — so they move with the row. Observed rather than measured on
   * interaction because `aria-valuemin`/`max` are render output: a range
   * computed only while dragging would leave a screen reader being told about
   * positions the handle refuses to reach.
   */
  useEffect(() => {
    const row = paneRowRef.current;
    if (!row) return;
    setPaneRowWidth(row.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPaneRowWidth(entry.contentRect.width);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [setPaneRowWidth]);

  const bounds = splitBounds(paneRowWidth);
  /**
   * What the pane actually gets, which is not always what the atom holds: the
   * split is persisted across sessions and across window sizes, so a width
   * saved on a wide monitor can be below the floor on a laptop. Clamping at
   * READ time rather than writing the atom back keeps the wide-monitor
   * preference intact for when that monitor comes back.
   */
  const effectiveSplit = clampSplit(splitPercent, bounds);

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
      setSplitPercent(
        clampSplit((fromStart / rect.width) * 100, splitBounds(rect.width)),
      );
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
    // Stepping from `effectiveSplit`, not the stored value: a persisted split
    // below this row's floor would otherwise need several presses before the
    // handle moved at all, since each one would clamp back to the same place.
    if (event.key === 'ArrowLeft')
      setSplitPercent(clampSplit(effectiveSplit - step, bounds));
    else if (event.key === 'ArrowRight')
      setSplitPercent(clampSplit(effectiveSplit + step, bounds));
    else if (event.key === 'Home') setSplitPercent(bounds.min);
    else if (event.key === 'End') setSplitPercent(bounds.max);
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
  const activeLibraryModule = library.disciplines
    .flatMap((d) => d.modules)
    .find((m) => m.id === activeLibraryModuleId);
  const flagship = findFlagshipCourse(board);

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
          style={{ flexBasis: `${effectiveSplit}%` }}
        >
          <LessonLibrary
            headerAction={
              capabilities.canCreateDiscipline ? (
                <CreateDisciplineDialogContainer
                  canAppointExperts={capabilities.canManageDisciplines}
                />
              ) : undefined
            }
          >
            {library.untitled.length > 0 && (
              <DisciplineColumnContainer
                disciplineId={UNTITLED_DISCIPLINE_ID}
                name="Untitled"
                discipline={{ modules: [], untitled: library.untitled }}
              />
            )}
            {library.disciplines.map((discipline) => (
              <DisciplineColumnContainer
                key={discipline.id}
                disciplineId={discipline.id}
                name={discipline.name}
                discipline={discipline}
                canManageDisciplines={capabilities.canManageDisciplines}
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
            ariaValueNow={Math.round(effectiveSplit)}
            // The clamp lives here, so the announced range does too — 0–100
            // told a screen reader about positions the handle refuses to move
            // to. These now move with the row, because the floors are one
            // column wide rather than a fixed share of it.
            ariaValueMin={Math.round(bounds.min)}
            ariaValueMax={Math.round(bounds.max)}
          />
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <CourseRail
            headerAction={
              capabilities.canCreateCourse ? (
                <CreateCourseDialogContainer
                  triggerLabel="New offering"
                  noun="offering"
                />
              ) : undefined
            }
          >
            {/* Not the flagship — see `courseRailBoards`. */}
            {courseRailBoards(board).map((courseBoard) => (
              <EditorCourseColumnContainer
                key={courseBoard.course.id}
                courseBoard={courseBoard}
                canEditCourse={capabilities.canEditCourse}
                canDeleteCourse={capabilities.canDeleteCourse}
                flagship={flagship}
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
        ) : activeLibraryModule ? (
          // Same neutral shape as `activeModule` above — no action buttons,
          // no provenance note, no lessons: a preview of what is being
          // carried, not the real (interactive) `LibraryModuleContainer`.
          <div className="w-96 rounded-xl border border-gray-6 bg-gray-2">
            <Accordion.Root multiple>
              <ModuleAccordionItem
                module={activeLibraryModule}
                lessonsSlot={null}
              />
            </Accordion.Root>
          </div>
        ) : activeLesson ? (
          <LessonCard lesson={activeLesson} />
        ) : activeLibraryLesson ? (
          <LibraryLessonCard lesson={activeLibraryLesson} />
        ) : null}
        {refusal && <DragRefusalNote reason={refusal} />}
      </DragOverlay>

      {/*
        Mounted once for the whole editor, not once per course: a lesson is
        org-owned, so the confirmation is not scoped to any one course. Which
        lesson it is about — and how many courses lose it — arrives on
        `deleteLessonAtom` from whichever card was clicked.
      */}
      <DeleteLessonDialogContainer />

      {/*
        The three discipline-column dialogs, mounted once for the same reason
        — each is driven by an atom naming the column that opened it, so eight
        columns share one dialog rather than mounting eight.

        Rename and delete render unconditionally even for an actor who cannot
        manage disciplines: the buttons that set their atoms are already
        withheld from that actor, so these can never be opened, and gating the
        mount as well would be a second copy of the same condition to keep in
        step. Both endpoints re-check `requireAdmin` regardless.
      */}
      <CreateLibraryLessonDialogContainer />
      {/*
        Editing what a lesson IS — name, availability, written content — from
        either pane. Lesson-level, not course-level: see the container's note
        for the split against `LessonConfigDialogContainer`, and for why video
        is not here.
      */}
      <LibraryLessonConfigDialogContainer />
      {/*
        The preview the play tile opens. Handed every module on the rail
        flattened, because it looks a lesson up by id and this board holds
        several courses at once — unlike the per-course board, which passes
        only its own.
      */}
      {/*
        The three course-level dialogs, mounted once for the rail rather than
        once per column — each is driven by an atom naming the course that
        opened it.

        `navigateAfterDelete={false}`: the per-course board leaves for /admin
        when its whole subject is deleted, but here the deleted course was one
        column of several and the rest are still there to work on.
      */}
      <EditorCreateModuleDialogContainer />
      <EditCourseDialogContainer />
      <DeleteCourseDialogContainer navigateAfterDelete={false} />
      <UnremixCourseDialogContainer />
      <LessonVideoModalContainer
        modules={board.flatMap((courseBoard) => courseBoard.modules)}
      />
      <RenameDisciplineDialogContainer />
      <DeleteDisciplineDialogContainer />
      {/*
        The three discipline-MODULE dialogs, mounted once for the same
        reason as the discipline ones above — each is driven by an atom
        naming the module (or discipline) that opened it.
      */}
      <CreateDisciplineModuleDialogContainer />
      <RenameDisciplineModuleDialogContainer />
      <DeleteDisciplineModuleDialogContainer />
    </DndContext>
  );
};

/** Whether the pointer is inside a droppable's rect, or within `DROP_SLOP_PX` of it. */
function pointerIsNear(
  rect:
    | { top: number; left: number; width: number; height: number }
    | undefined,
  pointer: { x: number; y: number },
): boolean {
  if (!rect) return false;
  return (
    pointer.x >= rect.left - DROP_SLOP_PX &&
    pointer.x <= rect.left + rect.width + DROP_SLOP_PX &&
    pointer.y >= rect.top - DROP_SLOP_PX &&
    pointer.y <= rect.top + rect.height + DROP_SLOP_PX
  );
}

/** The library card for a lesson id, across disciplines and the untitled column. */
function findLibraryLesson(
  library: OrgLibrary | undefined,
  lessonId: number | null,
): LibraryLesson | undefined {
  if (!library || lessonId == null) return undefined;
  return [
    ...library.untitled,
    ...library.disciplines.flatMap((d) => disciplineLessons(d)),
  ].find((l) => l.id === lessonId);
}

/** A discipline module found by walking every discipline, with the
 *  discipline that owns it — for naming it in an announcement. */
function findLibraryModuleWithDiscipline(
  library: OrgLibrary | undefined,
  moduleId: number,
) {
  if (!library) return null;
  for (const discipline of library.disciplines) {
    const module = discipline.modules.find((m) => m.id === moduleId);
    if (module) return { discipline, module };
  }
  return null;
}

/** A dnd id as a phrase a screen reader can read back. */
function describeDndTarget(
  id: string | number,
  board: OrgEditorBoard | null,
  library: OrgLibrary | undefined,
): string {
  const parsed = parseDndId(id);
  if (!parsed) return 'nothing';
  if (parsed.type === 'library-lesson') {
    return `library lesson ${findLibraryLesson(library, parsed.id)?.name ?? parsed.id}`;
  }
  if (parsed.type === 'library-module' || parsed.type === 'library-container') {
    // Found by walking the library, never by trusting anything about the id
    // beyond what it names — the same reasoning `resolveDrop` follows.
    const found = findLibraryModuleWithDiscipline(library, parsed.id);
    return found
      ? `${found.module.name} in ${found.discipline.name}`
      : String(id);
  }
  if (parsed.type === 'library-untitled') {
    const name =
      library?.disciplines.find((d) => d.id === parsed.id)?.name ??
      String(parsed.id);
    return `Untitled in ${name}`;
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
  if (parsed.type === 'course') {
    // Named explicitly rather than falling through to the module loop below,
    // which would match a MODULE whose id happened to equal this course's and
    // announce the wrong thing. Reachable now that a module drag can land on
    // an empty course column.
    const courseBoard = board.find((cb) => cb.course.id === parsed.id);
    return courseBoard ? `the ${courseBoard.course.name} column` : String(id);
  }
  if (parsed.type === 'lesson') {
    // A remixed module — and its lessons — can render in two columns; name
    // the course the dragged/hovered CARD actually belongs to, not whichever
    // column happens to appear first on the board.
    for (const cb of board) {
      if (cb.course.id !== parsed.courseId) continue;
      for (const mod of cb.modules) {
        const lesson = mod.lessons.find((l) => l.id === parsed.id);
        if (lesson) return `${lesson.name} in ${mod.name}, ${cb.course.name}`;
      }
    }
    return String(id);
  }
  for (const cb of board) {
    if (cb.course.id !== parsed.courseId) continue;
    const mod = cb.modules.find((m) => m.id === parsed.id);
    if (mod) return `${mod.name} in ${cb.course.name}`;
  }
  return String(id);
}
