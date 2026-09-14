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
