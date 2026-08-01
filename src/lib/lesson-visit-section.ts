/**
 * The `section_name` values written to `lesson_material_progress`.
 *
 * That table was imported from the old platform, where its sections were
 * content areas and nothing ever read or wrote it — the route existed but had
 * no callers, in that repo or this one. Reusing the table avoids a migration.
 *
 * Lives in lib, not db, for the same reason as `course-shaping.ts`: the
 * queries that read these are covered by tests that fully stub `@/db/schema`,
 * and importing from a module that transitively pulls the real schema in would
 * drag `@/types` — which vitest cannot resolve — into those suites.
 */

/** The lesson page itself was opened. Written server-side; see recordLessonVisit. */
export const LESSON_VISIT_SECTION = 'page';

/**
 * Material tabs whose selection counts toward progress.
 *
 * Deliberately excludes the quiz/debrief tab (D22): that slot has a real
 * completion signal of its own in `lesson_quiz_answers` /
 * `lesson_test_results`, so counting the tap as well would pay a learner twice
 * for one tab and give partial credit for opening it and bouncing.
 *
 * Also excludes `LESSON_VISIT_SECTION`, which is a different kind of fact and
 * is aggregated separately by the progress queries.
 */
export const TRACKED_LESSON_SECTIONS = [
  'keyPoints',
  'proTips',
  'links',
  'assignments',
  'jobOfTheDay',
] as const;

export type TrackedLessonSection = (typeof TRACKED_LESSON_SECTIONS)[number];

export function isTrackedLessonSection(
  value: string,
): value is TrackedLessonSection {
  return (TRACKED_LESSON_SECTIONS as readonly string[]).includes(value);
}

/**
 * SQL literal list for the tracked sections, e.g. `'keyPoints','proTips',...`.
 *
 * Built from the constant above so the queries and the writer cannot drift
 * onto different section names. Safe to interpolate: every value is a
 * compile-time literal from this file, never user input.
 */
export const TRACKED_SECTIONS_SQL_LIST = TRACKED_LESSON_SECTIONS.map(
  (s) => `'${s}'`,
).join(', ');
