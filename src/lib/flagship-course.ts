/**
 * ORG-SPECIFIC CONFIGURATION — the one place the codebase knows which course
 * is the flagship.
 *
 * The editor's "Remix …" button is pinned to this course rather than opening
 * a picker (spec, Admin UI, amended 2026-09-14): in production 3D Airmanship
 * holds 7 of 9 modules and every other course is an ITPS syllabus built
 * around it, so a picker would list one item. Everything BELOW the button is
 * generic — `remixCourse(courseId, sourceCourseId)`, the routes, the tables
 * — so replacing this constant with a picker touches only the UI.
 *
 * The button's label uses the course's NAME from the board, not this slug,
 * so a rename follows without a deploy. If no course carries this slug the
 * button renders nowhere rather than pointing at nothing.
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
 * courses on the rail borrow its modules through "Remix". Drawn as a column
 * too, it would sit beside the very courses that remix it, its modules on
 * screen twice. It is edited on its own board (`/admin/$courseId/editor`,
 * reached from the Courses screen and from every "Edited in …" link).
 *
 * The full board still feeds `findFlagshipCourse` and the drag resolver —
 * only what is DRAWN is filtered.
 */
export function courseRailBoards<
  C extends { course: { id: number; name: string; slug: string } },
>(boards: readonly C[]): C[] {
  return boards.filter((b) => b.course.slug !== FLAGSHIP_COURSE_SLUG);
}
