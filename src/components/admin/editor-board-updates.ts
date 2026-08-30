// `#/` not `@/`: this module is pure and sits beside `resolve-drop.ts`, which
// its test imports directly; keeping the alias consistent avoids a resolution
// trap the moment a test reaches for either.
import type {
  BoardLesson,
  LibraryLesson,
  OrgEditorBoard,
} from '#/lib/admin-schemas';
import { parseDndId } from '#/lib/dnd-ids';

/**
 * The optimistic cache edits behind the editor's drags, kept pure and out of
 * the drag handlers. Each returns a NEW board; none mutates its input, so the
 * snapshot the container holds for rollback stays intact.
 */

/** Every module on the board, flattened — ids are unique across courses. */
function allModules(board: OrgEditorBoard) {
  return board.flatMap((cb) => cb.modules);
}

/**
 * Where in a module's lesson list a drop lands: a `lesson` over id names the
 * slot it takes, anything else appends.
 *
 * Read from the list as it stands NOW, before the dragged lesson is pulled
 * out of it — that is what makes a same-module downward move land in the slot
 * under the pointer rather than one above it.
 */
function overIndexIn(lessons: BoardLesson[], overId: string | number): number {
  const over = parseDndId(overId);
  if (over?.type === 'lesson') {
    const at = lessons.findIndex((l) => l.id === over.id);
    if (at !== -1) return at;
  }
  return lessons.length;
}

function insertAt(
  board: OrgEditorBoard,
  lesson: BoardLesson,
  targetModuleId: number,
  index: number,
): OrgEditorBoard {
  return board.map((cb) => ({
    ...cb,
    modules: cb.modules.map((m) => {
      if (m.id !== targetModuleId) return m;
      const lessons = [...m.lessons];
      lessons.splice(Math.min(index, lessons.length), 0, lesson);
      return { ...m, lessons };
    }),
  }));
}

/** Move an already-placed lesson into `targetModuleId` at `overId`'s slot. */
export function moveLessonOnBoard(
  board: OrgEditorBoard,
  lessonId: number,
  targetModuleId: number,
  overId: string | number,
): OrgEditorBoard {
  const target = allModules(board).find((m) => m.id === targetModuleId);
  if (!target) return board;
  const index = overIndexIn(target.lessons, overId);

  let moved: BoardLesson | undefined;
  const stripped = board.map((cb) => ({
    ...cb,
    modules: cb.modules.map((m) => {
      const at = m.lessons.findIndex((l) => l.id === lessonId);
      if (at === -1) return m;
      moved = m.lessons[at];
      return { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) };
    }),
  }));
  if (!moved) return board;

  return insertAt(stripped, moved, targetModuleId, index);
}

/** Append a newly linked library lesson to the end of a module. */
export function linkLessonOnBoard(
  board: OrgEditorBoard,
  lesson: BoardLesson,
  targetModuleId: number,
): OrgEditorBoard {
  const target = allModules(board).find((m) => m.id === targetModuleId);
  if (!target) return board;
  // Appended, never inserted at the pointer's slot: the link route places the
  // lesson last (it takes no neighbours), so guessing a middle slot here would
  // show the admin a position the refetch is about to take away.
  return insertAt(board, lesson, targetModuleId, target.lessons.length);
}

/** Reorder a module within whichever course holds it. */
export function reorderModulesOnBoard(
  board: OrgEditorBoard,
  moduleId: number,
  overModuleId: number,
): OrgEditorBoard {
  return board.map((cb) => {
    const from = cb.modules.findIndex((m) => m.id === moduleId);
    const to = cb.modules.findIndex((m) => m.id === overModuleId);
    if (from === -1 || to === -1) return cb;
    const modules = [...cb.modules];
    const [moved] = modules.splice(from, 1);
    modules.splice(to, 0, moved);
    return { ...cb, modules };
  });
}

/** The lesson's neighbours in a module — the rank anchors the API wants. */
export function lessonNeighbours(
  board: OrgEditorBoard,
  moduleId: number,
  lessonId: number,
): { prevLessonId: number | null; nextLessonId: number | null } {
  const lessons =
    allModules(board).find((m) => m.id === moduleId)?.lessons ?? [];
  const at = lessons.findIndex((l) => l.id === lessonId);
  return {
    prevLessonId: lessons[at - 1]?.id ?? null,
    nextLessonId: lessons[at + 1]?.id ?? null,
  };
}

/** The module's neighbours within its own course. */
export function moduleNeighbours(
  board: OrgEditorBoard,
  moduleId: number,
): { prevModuleId: number | null; nextModuleId: number | null } {
  for (const cb of board) {
    const at = cb.modules.findIndex((m) => m.id === moduleId);
    if (at === -1) continue;
    return {
      prevModuleId: cb.modules[at - 1]?.id ?? null,
      nextModuleId: cb.modules[at + 1]?.id ?? null,
    };
  }
  return { prevModuleId: null, nextModuleId: null };
}

/**
 * The board card to show for a library lesson the instant it is dropped,
 * before the refetch brings the real placement back.
 *
 * The invented fields are the ones `LessonCard` never renders in this pane
 * (it is given no quickshot slot here) — every field the card actually draws
 * comes from the library lesson itself, so the optimistic card and the real
 * one look the same. Anything else would flicker into a different card a
 * moment later.
 */
export function boardLessonFromLibrary(lesson: LibraryLesson): BoardLesson {
  return {
    id: lesson.id,
    name: lesson.name,
    slug: lesson.slug,
    rank: 0,
    isAvailable: lesson.isAvailable,
    isConfigured: lesson.isConfigured,
    hasDebrief: false,
    needsVideoWatch: false,
    requiredSubscriptions: [],
    levels: [],
    quizQuestionCount: 0,
    dependsOn: [],
    videoProvider: null,
    videoRef: null,
  };
}
