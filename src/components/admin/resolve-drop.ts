// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import type {
  BoardLesson,
  BoardModule,
  CourseBoard,
  OrgEditorBoard,
} from '#/lib/admin-schemas';
import { parseDndId } from '#/lib/dnd-ids';
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
      /** The raw over id, so the caller can read the exact slot to insert at. */
      overId: string | number;
    }
  | { kind: 'reorder-module'; moduleId: number; overModuleId: number }
  | { kind: 'forbidden'; reason: string }
  | null;

/** A module found on the board, with the course board that owns it. */
interface LocatedModule {
  courseBoard: CourseBoard;
  module: BoardModule;
}

/** A placed lesson found on the board, with its module and course board. */
interface LocatedLesson extends LocatedModule {
  lesson: BoardLesson;
}

function findModule(
  board: OrgEditorBoard,
  moduleId: number,
): LocatedModule | null {
  for (const courseBoard of board) {
    const module = courseBoard.modules.find((m) => m.id === moduleId);
    if (module) return { courseBoard, module };
  }
  return null;
}

function findPlacedLesson(
  board: OrgEditorBoard,
  lessonId: number,
): LocatedLesson | null {
  for (const courseBoard of board) {
    for (const module of courseBoard.modules) {
      const lesson = module.lessons.find((l) => l.id === lessonId);
      if (lesson) return { courseBoard, module, lesson };
    }
  }
  return null;
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
    return findModule(board, over.id);
  }
  if (over.type === 'lesson') return findPlacedLesson(board, over.id);
  return null;
}

/** Whether any module of this course already teaches the lesson. */
function courseTeaches(courseBoard: CourseBoard, lessonId: number): boolean {
  return courseBoard.modules.some((m) =>
    m.lessons.some((l) => l.id === lessonId),
  );
}

export function resolveDrop(
  board: OrgEditorBoard,
  activeId: string | number,
  overId: string | number,
): DropResolution {
  const active = parseDndId(activeId);
  const over = parseDndId(overId);
  // An id neither side of the editor minted is not a refusal — there is
  // nothing there to refuse.
  if (!active || !over) return null;
  // Dropped on itself: a no-op, not a refusal.
  if (active.type === over.type && active.id === over.id) return null;

  if (active.type === 'module') {
    const from = findModule(board, active.id);
    if (!from) return null;

    if (over.type === 'discipline' || over.type === 'library-lesson') {
      return {
        kind: 'forbidden',
        reason: `"${from.module.name}" is a module of ${from.courseBoard.course.name}, and the library holds lessons, not modules. Drop it on another module in ${from.courseBoard.course.name} to reorder it.`,
      };
    }

    const to = resolveOverModule(board, overId);
    if (!to) return null;
    if (to.module.id === from.module.id) return null;
    if (to.courseBoard.course.id !== from.courseBoard.course.id) {
      return {
        kind: 'forbidden',
        reason: `"${from.module.name}" belongs to ${from.courseBoard.course.name}, so it cannot be moved into ${to.courseBoard.course.name}. Modules are only reordered within their own course.`,
      };
    }
    return {
      kind: 'reorder-module',
      moduleId: from.module.id,
      overModuleId: to.module.id,
    };
  }

  if (active.type === 'lesson') {
    const from = findPlacedLesson(board, active.id);
    if (!from) return null;

    if (over.type === 'discipline' || over.type === 'library-lesson') {
      return {
        kind: 'forbidden',
        // Names the control by the EXACT accessible name it wears, built from
        // the same function the control itself uses. Pointing at a label that
        // does not exist sends the reader hunting for a button that isn't
        // there, which is worse than saying nothing.
        reason: `The library already holds "${from.lesson.name}" — dragging it back changes nothing. Use the "${removeLessonLabel(from.lesson.name, from.module.name)}" control on its card to stop ${from.courseBoard.course.name} teaching it.`,
      };
    }

    const to = resolveOverModule(board, overId);
    if (!to) return null;
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
    // Library cards are draggable but never droppable, so one landing on
    // another is not a target the editor offers, not a rule it enforces.
    if (over.type === 'library-lesson') return null;

    const to = resolveOverModule(board, overId);
    if (!to) return null;
    if (courseTeaches(to.courseBoard, active.id)) {
      return {
        kind: 'forbidden',
        reason: `${to.courseBoard.course.name} already teaches this lesson. Drag the copy that is already in ${to.courseBoard.course.name} to move it between that course's modules.`,
      };
    }
    return { kind: 'link', moduleId: to.module.id, lessonId: active.id };
  }

  // `container` and `discipline` are drop targets, never draggables.
  return null;
}
