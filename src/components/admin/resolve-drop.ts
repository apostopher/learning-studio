// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import type {
  EditorBoardLesson,
  EditorBoardModule,
  EditorCourseBoard,
  LibraryDiscipline,
  LibraryDisciplineModule,
  LibraryLesson,
  OrgEditorBoard,
  OrgLibrary,
} from '#/lib/admin-schemas';
import { type ParsedDndId, parseDndId } from '#/lib/dnd-ids';
import { removeLessonLabel } from './lesson-card-labels';

/**
 * The knowledge editor's drag whitelist, as a pure function.
 *
 * Both panes of the editor share ONE `DndContext` — a library lesson has to
 * be draggable into a course column, so the nested-context trick that makes
 * cross-category drags impossible by construction in
 * `sortable-onboarding-category.tsx` is not available here. Every refusal is
 * therefore a guard, and a guard that lives inside a React drag handler is a
 * guard nobody can test. It lives here instead: no React, no DOM, no hooks.
 *
 * The four allowed drops:
 * A drop on a COURSE column itself — the target an empty course carries — is
 * always `forbidden`, never `link`: a lesson lives inside a module, and this
 * function does not invent one.
 *
 *   library lesson  → a module            = `link`   (place it in that course)
 *   placed lesson   → a module, same course = `move` (re-place or reorder)
 *   module          → a module, same course = `reorder-module`
 *
 * Everything else that lands on a REAL target is `forbidden`, never a silent
 * spring-back: `reason` is the sentence the admin reads. Dropping on nothing
 * recognisable is `null`, which is a different thing and must stay different
 * — an implementation that refuses everything would otherwise pass for one
 * that refuses the right things.
 */
export type DropResolution =
  | { kind: 'link'; moduleId: number; lessonId: number }
  | {
      kind: 'move';
      moduleId: number;
      lessonId: number;
      /**
       * The module the lesson was picked up from — `origin.moduleId`, handed
       * back so the route can pin the UPDATE to that ONE placement. A lesson
       * a course holds twice (its own module and a borrowed one) has two
       * placements; keyed on the lesson alone, the server matched both.
       */
      fromModuleId: number;
      /** The raw over id, so the caller can read the exact slot to insert at. */
      overId: string | number;
    }
  | {
      kind: 'reorder-module';
      /** The course whose rail was dragged — position belongs to the viewer, not the owner. */
      courseId: number;
      moduleId: number;
      overModuleId: number;
    }
  | {
      kind: 'library-move';
      lessonId: number;
      /** The discipline the DRAGGED lesson belongs to — found by locating it, never read off its (possibly stale) `disciplineModuleId`. */
      disciplineId: number;
      /** The destination box: a discipline module's id, or null for that discipline's Untitled group. */
      disciplineModuleId: number | null;
      /** The raw over id, so the caller can read the exact slot to insert at. */
      overId: string | number;
    }
  | {
      kind: 'reorder-library-module';
      disciplineId: number;
      moduleId: number;
      overModuleId: number;
    }
  | { kind: 'forbidden'; reason: string }
  | null;

/** The course a `course` drop target names, or null if it left the board. */
function findCourse(
  board: OrgEditorBoard,
  courseId: number,
): EditorCourseBoard | null {
  return board.find((cb) => cb.course.id === courseId) ?? null;
}

/**
 * Why a drop on a COURSE column itself is refused.
 *
 * That target only exists while a course has no modules — see
 * `EditorCourseEmptyContainer` — but this does not assume it: a course found
 * with modules gets the sentence that points at them instead. The reason has
 * to name the remedy, because "you cannot drop here" alone leaves the reader
 * with a lesson in hand and nowhere to put it.
 */
function courseDropRefusal(courseBoard: EditorCourseBoard): string {
  return courseBoard.modules.length === 0
    ? `${courseBoard.course.name} has no modules yet, and a lesson can only sit inside a module. Create one first, then drop the lesson into it.`
    : `Drop the lesson on one of ${courseBoard.course.name}'s modules — a lesson sits inside a module, not loose in the course.`;
}

/** A module found on the board, with the course board that owns it. */
interface LocatedModule {
  courseBoard: EditorCourseBoard;
  module: EditorBoardModule;
}

/** A placed lesson found on the board, with its module and course board. */
interface LocatedLesson extends LocatedModule {
  lesson: EditorBoardLesson;
}

/** True when the module is shown on this course's board but owned elsewhere. */
function isBorrowed(located: LocatedModule): boolean {
  return located.module.owner.id !== located.courseBoard.course.id;
}

/**
 * Why a lesson may not be added to or taken out of a borrowed module here.
 *
 * Content authority follows the OWNER (spec, Permissions row 2): the server
 * would refuse this with a 403 on the owner's course anyway, but a drag that
 * springs back with a bare "Forbidden" leaves the admin with a lesson in hand
 * and no idea where to put it. The sentence names the owner, says what the
 * viewing course's relationship is, and points at the two things that DO
 * work.
 */
function borrowedRefusal(target: LocatedModule, adding: boolean): string {
  const mod = target.module.name;
  const owner = target.module.owner.name;
  const viewing = target.courseBoard.course.name;
  return adding
    ? `"${mod}" is edited in ${owner} — ${viewing} only borrows it. Add the lesson to it from ${owner}’s board, or drop it on one of ${viewing}’s own modules.`
    : `"${mod}" is edited in ${owner} — ${viewing} only borrows it, so its lessons are arranged there.`;
}

/**
 * Scoped to ONE course's column: a module (and every lesson it holds) can sit
 * on two rails at once through a remix, so a lookup by module id alone would
 * land on whichever column happens to come first on the board — typically
 * the owner's, not the one the drag actually started or landed in.
 */
function findModule(
  board: OrgEditorBoard,
  courseId: number,
  moduleId: number,
): LocatedModule | null {
  const courseBoard = findCourse(board, courseId);
  if (!courseBoard) return null;
  const module = courseBoard.modules.find((m) => m.id === moduleId);
  if (!module) return null;
  return { courseBoard, module };
}

/**
 * Where a placed lesson was picked up: its module at drag START.
 *
 * An input, never a search. A course can hold one lesson twice — in a module
 * it owns and in one it borrowed — and a search by lesson id lands on
 * whichever module comes first on the board, which for a remix is usually
 * the borrowed copy: dragging the course's own copy was then refused as
 * "edited in <owner>", and the server's UPDATE matched both placements.
 *
 * Read from the sortable's `data.moduleId` when the drag starts, not at the
 * drop: `onDragOver` carries a lesson into another module live, the card
 * re-registers under its new module, and dnd-kit's data ref follows it.
 */
export type DragOrigin = { moduleId: number };

/**
 * A DROP TARGET that is a placed lesson, resolved by search — the over side
 * carries no pick-up data. Own modules are searched before borrowed ones: a
 * borrowed module registers no droppables (its lessons render read-only), so
 * an `over` lesson id can only ever name the course's own copy, and a
 * first-match search that landed on the borrowed copy would refuse the drop
 * as adding to a borrowed module.
 */
function findPlacedLesson(
  board: OrgEditorBoard,
  courseId: number,
  lessonId: number,
): LocatedLesson | null {
  const courseBoard = findCourse(board, courseId);
  if (!courseBoard) return null;
  const own = courseBoard.modules.filter(
    (m) => m.owner.id === courseBoard.course.id,
  );
  const borrowed = courseBoard.modules.filter(
    (m) => m.owner.id !== courseBoard.course.id,
  );
  for (const module of [...own, ...borrowed]) {
    const lesson = module.lessons.find((l) => l.id === lessonId);
    if (lesson) return { courseBoard, module, lesson };
  }
  return null;
}

/**
 * The lesson being DRAGGED, located by its pick-up module. The lesson record
 * itself is read from that module when it is still there, and from anywhere
 * in the same column otherwise — `onDragOver` may already have carried it
 * into another module live, and every copy of a lesson carries the same
 * name, which is all the refusals below need from it.
 */
function findDraggedLesson(
  board: OrgEditorBoard,
  courseId: number,
  lessonId: number,
  origin: DragOrigin,
): LocatedLesson | null {
  const from = findModule(board, courseId, origin.moduleId);
  if (!from) return null;
  const lesson =
    from.module.lessons.find((l) => l.id === lessonId) ??
    from.courseBoard.modules
      .flatMap((m) => m.lessons)
      .find((l) => l.id === lessonId);
  if (!lesson) return null;
  return { ...from, lesson };
}

/**
 * The module a drop target belongs to: a `container` or `module` id names one
 * directly, a placed `lesson` id resolves through the board. A `discipline` or
 * `library-lesson` id never resolves here — those are library targets and are
 * answered separately, with a reason, by each caller below.
 */
function resolveOverModule(
  board: OrgEditorBoard,
  overId: string | number,
): LocatedModule | null {
  const over = parseDndId(overId);
  if (!over) return null;
  if (over.type === 'container' || over.type === 'module') {
    return findModule(board, over.courseId, over.id);
  }
  if (over.type === 'lesson')
    return findPlacedLesson(board, over.courseId, over.id);
  return null;
}

/**
 * A library lesson found by walking the library's own buckets — never by
 * trusting its `disciplineModuleId` field. That field can go stale (its
 * module was deleted, say) while the payload has already re-bucketed the
 * lesson under Untitled, so it is an OUTPUT of `moveLessonInLibrary`, never
 * an input for locating anything.
 *
 * `discipline: null` means the lesson was found in the ORG-LEVEL `untitled`
 * (no discipline assigned at all) — distinct from `boxId: null`, which means
 * a discipline's own Untitled group.
 */
interface LocatedLibraryLesson {
  lesson: LibraryLesson;
  discipline: LibraryDiscipline | null;
  boxId: number | null;
}

/** Walks every discipline's modules then its Untitled group, then the
 *  org-level Untitled column, in that order. */
function findLibraryLesson(
  library: OrgLibrary,
  lessonId: number,
): LocatedLibraryLesson | null {
  for (const discipline of library.disciplines) {
    for (const module of discipline.modules) {
      const lesson = module.lessons.find((l) => l.id === lessonId);
      if (lesson) return { lesson, discipline, boxId: module.id };
    }
    const untitled = discipline.untitled.find((l) => l.id === lessonId);
    if (untitled) return { lesson: untitled, discipline, boxId: null };
  }
  const orphan = library.untitled.find((l) => l.id === lessonId);
  if (orphan) return { lesson: orphan, discipline: null, boxId: null };
  return null;
}

/** A discipline module found by walking every discipline, with the
 *  discipline that owns it. */
function findLibraryModule(
  library: OrgLibrary,
  moduleId: number,
): { discipline: LibraryDiscipline; module: LibraryDisciplineModule } | null {
  for (const discipline of library.disciplines) {
    const module = discipline.modules.find((m) => m.id === moduleId);
    if (module) return { discipline, module };
  }
  return null;
}

/** Why a library lesson with no discipline cannot be filed into a module —
 *  there is no discipline's module list to file it into. Its `link` onto a
 *  course module is unaffected; this only guards library-side targets. */
function noDisciplineRefusal(lesson: LibraryLesson): string {
  return `"${lesson.name}" has no discipline yet, so there are no modules to file it in. Drag it onto a course module to teach it there.`;
}

/** Why a lesson may not be filed into a module of a DIFFERENT discipline
 *  than the one it belongs to. */
function crossDisciplineLessonRefusal(from: LocatedLibraryLesson): string {
  const disciplineName = from.discipline?.name ?? '';
  return `"${from.lesson.name}" is in ${disciplineName}. Lessons stay in their discipline — file it into one of ${disciplineName}’s modules, or drop it on a course module to teach it there.`;
}

/**
 * The target box a library-side drop names: which discipline module id (or
 * null for Untitled) it resolves to, and which discipline owns that box.
 * `null` when the target id does not resolve on this library at all (an
 * over id for a module/discipline that has since disappeared).
 */
/**
 * A library-side over kind: anything a library lesson or module can
 * meaningfully land on. A real type guard, not a `Set.has` + cast — so
 * `ParsedDndId` and this list cannot drift apart silently.
 *
 * Written out rather than `Extract<ParsedDndId, { type: ... }>`: every FLAT
 * kind (`library-lesson`/`discipline`/`course`/`library-module`/
 * `library-container`/`library-untitled`) shares ONE object shape in
 * `ParsedDndId`, with `type` itself a union inside it — so `Extract` sees no
 * member of `ParsedDndId` as a subtype of the narrower `type` and resolves
 * to `never` for both union arms, not the intended subset.
 */
type LibraryTarget = {
  type:
    | 'library-module'
    | 'library-container'
    | 'library-untitled'
    | 'library-lesson';
  id: number;
  courseId?: undefined;
};
function isLibraryTarget(over: ParsedDndId): over is LibraryTarget {
  return (
    over.type === 'library-module' ||
    over.type === 'library-container' ||
    over.type === 'library-untitled' ||
    over.type === 'library-lesson'
  );
}

function resolveLibraryTarget(
  library: OrgLibrary,
  over: LibraryTarget,
): { disciplineId: number; boxId: number | null } | null {
  if (over.type === 'library-module' || over.type === 'library-container') {
    const found = findLibraryModule(library, over.id);
    if (!found) return null;
    return { disciplineId: found.discipline.id, boxId: found.module.id };
  }
  if (over.type === 'library-untitled') {
    const discipline = library.disciplines.find((d) => d.id === over.id);
    if (!discipline) return null;
    return { disciplineId: discipline.id, boxId: null };
  }
  // over.type === 'library-lesson': the target's box is wherever THAT lesson
  // is found — its module, or null for its discipline's Untitled.
  const target = findLibraryLesson(library, over.id);
  if (!target || !target.discipline) return null;
  return { disciplineId: target.discipline.id, boxId: target.boxId };
}

/**
 * The discipline module that OWNS a library-side over target, for a
 * `library-module` drag. A pointer dragging a module's HEADER spends most of
 * its time over sibling modules' lesson cards and containers, not their
 * headers — dnd-kit reports those as `over` far more often than the header
 * itself — so a `library-container`/`library-lesson` target resolves to the
 * module it belongs to, exactly like the course rail's `resolveOverModule`
 * resolves a lesson/container id to its module. A lesson found in a
 * discipline's own Untitled group (or the org-level one) names no module —
 * Untitled is always last and is not a module — so this answers `null`
 * there, same as for a target that has vanished from the library.
 */
function moduleForLibraryTarget(
  library: OrgLibrary,
  over: LibraryTarget,
): { discipline: LibraryDiscipline; module: LibraryDisciplineModule } | null {
  if (over.type === 'library-lesson') {
    const located = findLibraryLesson(library, over.id);
    if (!located || located.boxId === null) return null;
    return findLibraryModule(library, located.boxId);
  }
  if (over.type === 'library-container') {
    return findLibraryModule(library, over.id);
  }
  if (over.type === 'library-module') {
    return findLibraryModule(library, over.id);
  }
  // `library-untitled`: Untitled is not a module.
  return null;
}

/** Whether any module of this course already teaches the lesson. */
function courseTeaches(
  courseBoard: EditorCourseBoard,
  lessonId: number,
): boolean {
  return courseBoard.modules.some((m) =>
    m.lessons.some((l) => l.id === lessonId),
  );
}

export function resolveDrop(
  board: OrgEditorBoard,
  activeId: string | number,
  overId: string | number,
  /**
   * Required for a `lesson` drag (see `DragOrigin`); ignored for every other
   * kind. A lesson drag without one is unresolvable — `null`, not a guess.
   */
  origin?: DragOrigin | null,
  /**
   * Required to resolve any LIBRARY-side target (`library-module` /
   * `library-container` / `library-untitled` / `library-lesson` as an over
   * id, or a `library-module` drag). Without it those resolve `null` rather
   * than guessing — the drop springs back exactly as it would if the library
   * had not loaded yet.
   */
  library?: OrgLibrary,
): DropResolution {
  const active = parseDndId(activeId);
  const over = parseDndId(overId);
  // An id neither side of the editor minted is not a refusal — there is
  // nothing there to refuse.
  if (!active || !over) return null;
  // Dropped on itself: a no-op, not a refusal. Courses too — a remixed
  // module renders on two rails, so the same numeric id can legitimately
  // belong to two DIFFERENT cards; only an exact id AND column match is
  // truly the same card.
  if (
    active.type === over.type &&
    active.id === over.id &&
    active.courseId === over.courseId
  )
    return null;

  if (active.type === 'module') {
    const from = findModule(board, active.courseId, active.id);
    if (!from) return null;

    // EVERY library-side target — a discipline column, a lesson card, a
    // module header/container, an Untitled droppable — is refused by name.
    // The collision filter only ever offers a rail module the column itself
    // (`acceptsModuleDrag`), so the finer library kinds are listed for
    // symmetry with the lesson branch below, where they ARE reachable.
    if (over.type === 'discipline' || isLibraryTarget(over)) {
      return {
        kind: 'forbidden',
        reason: `"${from.module.name}" is a module of ${from.courseBoard.course.name}, and the library holds lessons, not modules. Drop it on another module in ${from.courseBoard.course.name} to reorder it.`,
      };
    }

    if (over.type === 'course') {
      const courseBoard = findCourse(board, over.id);
      if (!courseBoard) return null;
      return {
        kind: 'forbidden',
        reason: `"${from.module.name}" is placed in ${from.courseBoard.course.name}, and modules are only reordered within their own course — they cannot be moved into ${courseBoard.course.name}.`,
      };
    }

    const to = resolveOverModule(board, overId);
    if (!to) return null;
    // Same CARD, not just the same module id: a remixed module renders one
    // card per column it is shown in, so `to.module.id === from.module.id`
    // alone is no longer enough to mean "dropped on itself" — it is equally
    // true of a genuine cross-course drop onto the OTHER column's card for
    // this module, which must fall through to the cross-course refusal
    // below, not silently no-op.
    if (
      to.module.id === from.module.id &&
      to.courseBoard.course.id === from.courseBoard.course.id
    )
      return null;
    if (to.courseBoard.course.id !== from.courseBoard.course.id) {
      return {
        kind: 'forbidden',
        reason: `"${from.module.name}" is placed in ${from.courseBoard.course.name}, so it cannot be moved into ${to.courseBoard.course.name}. Modules are only reordered within their own course.`,
      };
    }
    return {
      kind: 'reorder-module',
      courseId: from.courseBoard.course.id,
      moduleId: from.module.id,
      overModuleId: to.module.id,
    };
  }

  if (active.type === 'lesson') {
    if (!origin) return null;
    const from = findDraggedLesson(board, active.courseId, active.id, origin);
    if (!from) return null;
    // Content authority follows the owner: this must win over every other
    // refusal below, including the cross-course one — a borrowed module's
    // lessons cannot be rearranged from any viewing column, not just other
    // courses' columns.
    if (isBorrowed(from))
      return { kind: 'forbidden', reason: borrowedRefusal(from, false) };

    // Every library-side target, not just a column or a lesson card: an
    // EMPTY discipline module (only its container to land on) and an empty
    // Untitled group otherwise fell through to `resolveOverModule` and a
    // silent `null` — the one thing a refusal is not allowed to be.
    if (over.type === 'discipline' || isLibraryTarget(over)) {
      return {
        kind: 'forbidden',
        // Names the control by the EXACT accessible name it wears, built from
        // the same function the control itself uses. Pointing at a label that
        // does not exist sends the reader hunting for a button that isn't
        // there, which is worse than saying nothing.
        reason: `The library already holds "${from.lesson.name}" — dragging it back changes nothing. Use the "${removeLessonLabel(from.lesson.name, from.module.name)}" control on its card to stop ${from.courseBoard.course.name} teaching it.`,
      };
    }

    if (over.type === 'course') {
      const courseBoard = findCourse(board, over.id);
      if (!courseBoard) return null;
      // A placed lesson dropped on an EMPTY course is the cross-course move
      // that is always refused, so it gets that reason rather than the
      // create-a-module one — the module is not what is missing.
      return {
        kind: 'forbidden',
        reason:
          courseBoard.course.id === from.courseBoard.course.id
            ? courseDropRefusal(courseBoard)
            : `"${from.lesson.name}" is placed in ${from.courseBoard.course.name}, and a placed lesson only moves between modules of its own course. Drag it from the library to add it to ${courseBoard.course.name} as well.`,
      };
    }

    const to = resolveOverModule(board, overId);
    if (!to) return null;
    // Same reasoning as the `from` check above, ahead of the cross-course
    // refusal: a borrowed module refuses content changes from its OWN
    // column too, not only from other courses'.
    if (isBorrowed(to))
      return { kind: 'forbidden', reason: borrowedRefusal(to, true) };
    if (to.courseBoard.course.id !== from.courseBoard.course.id) {
      return {
        kind: 'forbidden',
        reason: `"${from.lesson.name}" is placed in ${from.courseBoard.course.name}, and a placed lesson only moves between modules of its own course. Drag it from the library to add it to ${to.courseBoard.course.name} as well.`,
      };
    }
    return {
      kind: 'move',
      moduleId: to.module.id,
      lessonId: from.lesson.id,
      fromModuleId: origin.moduleId,
      overId,
    };
  }

  if (active.type === 'library-lesson') {
    if (over.type === 'discipline') {
      return {
        kind: 'forbidden',
        reason:
          'A discipline column only groups the library — it does not teach anything. Drop this lesson on a module in a course to add it there.',
      };
    }

    // Library-side targets: filing the lesson into a module, its
    // discipline's Untitled group, or reordering it against another lesson.
    // Library cards are sortables now, hence droppables — the old "landing on
    // another library-lesson is not a target the editor offers" line no
    // longer holds; a `library-lesson` over id is a real reorder target.
    if (isLibraryTarget(over)) {
      if (!library) return null;
      const from = findLibraryLesson(library, active.id);
      if (!from) return null;
      // A lesson with no discipline at all has no discipline's modules to
      // file it into — its `link` onto a course container, below, is
      // unaffected by this refusal.
      if (!from.discipline)
        return { kind: 'forbidden', reason: noDisciplineRefusal(from.lesson) };

      const target = resolveLibraryTarget(library, over);
      if (!target) return null;
      if (target.disciplineId !== from.discipline.id) {
        return {
          kind: 'forbidden',
          reason: crossDisciplineLessonRefusal(from),
        };
      }
      return {
        kind: 'library-move',
        lessonId: from.lesson.id,
        disciplineId: from.discipline.id,
        disciplineModuleId: target.boxId,
        overId,
      };
    }

    if (over.type === 'course') {
      const courseBoard = findCourse(board, over.id);
      if (!courseBoard) return null;
      return { kind: 'forbidden', reason: courseDropRefusal(courseBoard) };
    }

    const to = resolveOverModule(board, overId);
    if (!to) return null;
    if (courseTeaches(to.courseBoard, active.id)) {
      return {
        kind: 'forbidden',
        reason: `${to.courseBoard.course.name} already teaches this lesson. Drag the copy that is already in ${to.courseBoard.course.name} to move it between that course's modules.`,
      };
    }
    // Content authority follows the owner: linking a lesson into a borrowed
    // module here would edit the OWNER's content from the borrower's board.
    if (isBorrowed(to))
      return { kind: 'forbidden', reason: borrowedRefusal(to, true) };
    return { kind: 'link', moduleId: to.module.id, lessonId: active.id };
  }

  if (active.type === 'library-module') {
    if (!library) return null;
    const from = findLibraryModule(library, active.id);
    if (!from) return null;

    // A pointer dragging a module's HEADER hovers sibling modules' lesson
    // cards and containers far more often than a header — `moduleForLibrary
    // Target` resolves any of those (or a direct module target) to the
    // module that owns it, the same as `resolveOverModule` does for the
    // course rail.
    if (isLibraryTarget(over) && over.type !== 'library-untitled') {
      const to = moduleForLibraryTarget(library, over);
      // No module owns the target — either it names no module at all (a
      // lesson sitting in a discipline's own Untitled group, or the
      // org-level one: Untitled is always last and is not a module) or it
      // has vanished from the library. Nothing to reorder against and
      // nothing to refuse.
      if (!to) return null;
      // Dropped on its own card/container: a no-op, not a refusal.
      if (to.module.id === from.module.id) return null;
      if (to.discipline.id !== from.discipline.id) {
        return {
          kind: 'forbidden',
          reason: `"${from.module.name}" is in ${from.discipline.name}. Modules stay in their discipline; it cannot be moved into ${to.discipline.name}.`,
        };
      }
      return {
        kind: 'reorder-library-module',
        disciplineId: from.discipline.id,
        moduleId: from.module.id,
        overModuleId: to.module.id,
      };
    }

    // `library-untitled` and a discipline column id: Untitled is always
    // last and is not a module, and a discipline column only groups the
    // library — neither is a module to reorder against, and neither is
    // refused (there is nothing to say beyond "not a target").
    if (over.type === 'library-untitled' || over.type === 'discipline')
      return null;

    // Every remaining target is a course rail one (a course's module/lesson/
    // container/course itself): a discipline module organises the library
    // only, and is never a course concept.
    return {
      kind: 'forbidden',
      reason:
        'A discipline module organises the library; it cannot be added to a course. Drag its lessons into the course instead.',
    };
  }

  // `container` and `discipline` are drop targets, never draggables.
  return null;
}
