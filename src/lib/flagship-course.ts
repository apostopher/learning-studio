/**
 * ORG-SPECIFIC CONFIGURATION — the one place the codebase knows which course
 * is the flagship.
 *
 * The flagship is ALWAYS remixed into every other course in its org (amended
 * 2026-10-14): `createCourse` remixes it into each new course and
 * `scripts/remix-flagship-everywhere.ts` back-fills the rest (see
 * `#/db/flagship-remix`). So the editor offers no "Remix …" button, and its
 * course rail draws only the modules each course does NOT borrow from the
 * flagship. Everything below that is still generic — `remixCourse`, the
 * routes, the tables — so a picker could return without touching them.
 *
 * Labels use the course's NAME from the board, not this slug, so a rename
 * follows without a deploy. If no course carries this slug nothing is
 * filtered and no note is shown.
 */
export const FLAGSHIP_COURSE_SLUG = '3d-airmanship';

export function findFlagshipCourse<
  C extends { course: { id: number; name: string; slug: string } },
>(boards: readonly C[]): C['course'] | null {
  return (
    boards.find((b) => b.course.slug === FLAGSHIP_COURSE_SLUG)?.course ?? null
  );
}

/**
 * The boards the editor's course rail draws: every course EXCEPT the
 * flagship.
 *
 * The flagship is the library, not a course among courses: its lessons are
 * filed under the discipline of the same name in the left pane, and the
 * courses on the rail all borrow its modules (see `railModules`). Drawn as
 * a column too, it would sit beside the very courses that remix it, its
 * modules on screen twice. It is edited on its own board
 * (`/admin/$courseId/editor`, reached from the Courses screen and from every
 * "Edited in …" link).
 *
 * The full board still feeds `findFlagshipCourse` and the drag resolver —
 * only what is DRAWN is filtered.
 */
export function courseRailBoards<
  C extends { course: { id: number; name: string; slug: string } },
>(boards: readonly C[]): C[] {
  return boards.filter((b) => b.course.slug !== FLAGSHIP_COURSE_SLUG);
}

/**
 * The modules a rail column draws: every module EXCEPT those the course
 * borrows from the flagship. Every course borrows all of them, so drawn they
 * would repeat the same modules down every column; `flagshipRailNote` says
 * they are there instead.
 *
 * Only what is DRAWN is filtered — the board in the query cache keeps the
 * full list, which is what the reorder path (`reorderModulesOnBoard` +
 * `moduleNeighbours`) runs on. That is deliberate: a drop lands directly
 * beside the module it was dropped on in the FULL list, so the visible order
 * matches the sortable, and the flagship's contiguous block is never split by
 * a midpoint rank landing inside it.
 */
export function railModules<M extends { owner: { id: number } }>(
  courseBoard: { modules: readonly M[] },
  flagshipId: number | null,
): M[] {
  if (flagshipId === null) return [...courseBoard.modules];
  return courseBoard.modules.filter((m) => m.owner.id !== flagshipId);
}

/**
 * The line a rail column shows about the flagship modules it hides.
 *
 * Read off the column's own `remixes`, not assumed: a course created before
 * the backfill ran, or whose create-time remix failed, holds none of the
 * flagship's modules, and claiming it "includes all" of them would hide the
 * gap. Such a course says so instead.
 */
export function flagshipRailNote(
  flagship: { id: number; name: string } | null,
  courseBoard: {
    course: { id: number };
    remixes: ReadonlyArray<{ sourceCourseId: number }>;
  },
): string | null {
  if (flagship === null || flagship.id === courseBoard.course.id) return null;
  return courseBoard.remixes.some((r) => r.sourceCourseId === flagship.id)
    ? `Includes all ${flagship.name} modules`
    : `Not yet linked to ${flagship.name} modules`;
}
