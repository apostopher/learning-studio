import { sql } from 'drizzle-orm';
import { DEBRIEF_PAR_SCORE } from '#/lib/debrief-schedule';
import { FLAGSHIP_DISCIPLINE_SLUG } from '#/lib/flagship-course';
import {
  isTrackedLessonSection,
  LESSON_VISIT_SECTION,
  TRACKED_LESSON_SECTIONS,
  TRACKED_SECTIONS_SQL_LIST,
  type TrackedLessonSection,
} from '#/lib/lesson-visit-section';
import { lessonMaterialProgressTable, lessonsTable } from '@/db/schema';

/**
 * The component facts both progress queries select, in one place.
 *
 * `getCourseProgress` (one course) and `getMyCourses` (every subscribed course)
 * feed the same aggregator from different queries. Anything that lives in only
 * one of them makes a course card disagree with its own sidebar, so the shared
 * parts live here and both spread them.
 *
 * Everything is reduced to a boolean or an integer IN POSTGRES. A sidebar
 * render must not pull lesson body text or quiz JSON across the wire just to
 * learn whether a quiz exists.
 */

/**
 * Correlated EXISTS/scalar subqueries rather than joins, deliberately.
 *
 * Joining `lesson_quiz_answers` (one row per attempt), `lesson_test_results`
 * (one per debrief) and `lesson_material` (no UNIQUE on lesson_slug, so
 * duplicates are possible) would multiply against the ≤18 video-progress rows
 * and ≤6 section rows already joined per lesson. On a 100-lesson course that
 * is tens of thousands of intermediate rows to aggregate away. A scalar
 * subquery is evaluated once per lesson and cannot multiply anything; both
 * tables carry a (user_id, lesson_slug) index for it to ride.
 */
export const progressComponentColumns = (userId: string) => ({
  videoProvider: lessonsTable.videoProvider,
  videoRef: lessonsTable.videoRef,
  needsVideoWatch: lessonsTable.needsVideoWatch,
  hasDebrief: lessonsTable.hasDebrief,

  /**
   * Tabs with content behind them. `json_array_length(NULL)` is NULL and
   * `NULL > 0` is NULL, so a missing material row or an unset column falls
   * through every CASE to 0 — a lesson with no material asks for no sections.
   *
   * The closing tab counts by DISCIPLINE, mirroring `materialExtraTabFor`:
   * Job of the Day on 3D Airmanship lessons, TEST THIS! on every other (a
   * lesson with no discipline included — its slug subquery is NULL, which
   * fails the `=` and takes the ELSE). Counting whichever column is filled
   * would let a stray value demand a tab the learner is never shown, and the
   * lesson could then never complete.
   */
  applicableSectionNames: sql<string[]>`coalesce((
    select array_remove(array[
        (case when json_array_length(m.key_points) > 0 then 'keyPoints' end),
        (case when coalesce(m.pro_tips, '') <> '' then 'proTips' end),
        (case when json_array_length(m.links) > 0 then 'links' end),
        (case when coalesce(m.assignments, '') <> '' then 'assignments' end),
        (case
          when (select d.slug from disciplines d where d.id = ${lessonsTable.disciplineId}) = ${FLAGSHIP_DISCIPLINE_SLUG}
            then (case when coalesce(m.job_of_the_day, '') <> '' then 'jobOfTheDay' end)
          else (case when json_array_length(m.test_this) > 0 then 'testThis' end)
        end)
      ], null)
    from lesson_material m
    where m.lesson_slug = ${lessonsTable.slug}
    limit 1
  ), '{}')`,

  /**
   * Distinct tracked sections this learner has selected.
   *
   * A FILTER over the already-joined progress rows rather than a second join:
   * the same LEFT JOIN carries both the 'page' row and the section rows, and
   * DISTINCT keeps this correct even if that join ever multiplies.
   */
  tappedSectionNames: sql<string[]>`coalesce(
    array_agg(distinct ${lessonMaterialProgressTable.sectionName})
    filter (where ${lessonMaterialProgressTable.completed}
      and ${lessonMaterialProgressTable.sectionName} in (${sql.raw(TRACKED_SECTIONS_SQL_LIST)})),
    '{}')`,

  /** The authored quiz has at least one question. Approximate — see the ledger. */
  hasQuiz: sql<boolean>`exists (
    select 1 from lesson_material m
    where m.lesson_slug = ${lessonsTable.slug}
      and json_array_length(m.quiz) > 0
  )`,

  /**
   * Whether the debrief counts toward the COURSE percent (call 11).
   *
   * The switch is on AND either the lesson has authored body text, or the
   * server has already produced a debrief for this pilot (prepared or taken).
   * A transcript-only debrief therefore becomes bearing only once one really
   * exists, so a lesson whose captions turn out unusable never blocks
   * course-done.
   */
  debriefBearing: sql<boolean>`(${lessonsTable.hasDebrief} and (
    exists (
      select 1 from lesson_material m
      where m.lesson_slug = ${lessonsTable.slug} and coalesce(m.text, '') <> ''
    )
    or exists (
      select 1 from prepared_debriefs p
      where p.user_id = ${userId} and p.lesson_slug = ${lessonsTable.slug}
    )
    or exists (
      select 1 from lesson_test_results t
      where t.user_id = ${userId} and t.lesson_slug = ${lessonsTable.slug}
    )
  ))`,

  quizPlayed: sql<boolean>`exists (
    select 1 from lesson_quiz_answers q
    where q.user_id = ${userId} and q.lesson_slug = ${lessonsTable.slug}
  )`,

  /**
   * Passed = a COMPLETED attempt at or above par. `completed_at IS NOT NULL`
   * rather than row existence, so a partial save never counts.
   */
  debriefPassed: sql<boolean>`exists (
    select 1 from lesson_test_results t
    where t.user_id = ${userId}
      and t.lesson_slug = ${lessonsTable.slug}
      and t.completed_at is not null
      and t.total_score >= ${DEBRIEF_PAR_SCORE}
  )`,

  /**
   * Latest completed below-par attempt; starts the retake wait. `completed_at`
   * is a timezone-less timestamp that drizzle stores as UTC; `at time zone 'UTC'`
   * makes the raw string carry an offset so `toIso` cannot read it as local time.
   */
  lastFailedDebriefAt: sql<Date | null>`(
    select max(t.completed_at) at time zone 'UTC' from lesson_test_results t
    where t.user_id = ${userId}
      and t.lesson_slug = ${lessonsTable.slug}
      and t.completed_at is not null
      and t.total_score < ${DEBRIEF_PAR_SCORE}
  )`,

  /** When the lesson first reached 100% for this learner (sticky). */
  doneAt: sql<Date | null>`(
    select c.done_at from lesson_completions c
    where c.user_id = ${userId} and c.lesson_id = ${lessonsTable.id}
  )`,

  visited: sql<boolean>`coalesce(bool_or(${lessonMaterialProgressTable.completed}
    and ${lessonMaterialProgressTable.sectionName} = ${LESSON_VISIT_SECTION}), false)`,
});

/**
 * Columns that must appear in GROUP BY alongside the grouped lesson id.
 *
 * Postgres would allow most of these by functional dependency on the grouped
 * primary key, but `slug` is referenced inside the correlated subqueries above
 * and the rest are plain selects — listing them explicitly costs nothing
 * (they are all constant within a group) and removes any doubt.
 */
export const progressComponentGroupBy = [
  lessonsTable.slug,
  lessonsTable.videoProvider,
  lessonsTable.videoRef,
  lessonsTable.needsVideoWatch,
  lessonsTable.hasDebrief,
] as const;

type ComponentRow = {
  videoProvider: string | null;
  videoRef: string | null;
  needsVideoWatch: boolean | null;
  hasDebrief: boolean | null;
  applicableSectionNames: string[];
  tappedSectionNames: string[];
  hasQuiz: boolean;
  quizPlayed: boolean;
  debriefBearing: boolean | null;
  debriefPassed: boolean;
  lastFailedDebriefAt: Date | string | null;
  doneAt: Date | string | null;
  visited: boolean;
};

/**
 * Keep known section names, in TRACKED_LESSON_SECTIONS order, so the output is
 * canonical whatever order Postgres returned them in.
 */
function toSectionNames(names: readonly string[]): TrackedLessonSection[] {
  const known = new Set(names.filter(isTrackedLessonSection));
  return TRACKED_LESSON_SECTIONS.filter((s) => known.has(s));
}

/** Raw `sql<Date>` columns come back as ISO-ish strings from the driver, Dates elsewhere. */
function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/**
 * Map a selected row to the aggregator's component fields.
 *
 * The booleans are nullable in TS because the lessons table is LEFT JOINed for
 * the empty-module placeholder; that row is discarded by the aggregator, so
 * the defaults here only ever apply to a row nobody scores.
 */
export function toComponentFields(row: ComponentRow) {
  return {
    // Derived from the same two columns as the course payload's `hasVideo`
    // (see getCourseDetails) so the ring and the gate cannot disagree about
    // whether a lesson has a video.
    hasVideo: row.videoProvider !== null && row.videoRef !== null,
    needsVideoWatch: row.needsVideoWatch ?? false,
    applicableSectionNames: toSectionNames(row.applicableSectionNames),
    tappedSectionNames: toSectionNames(row.tappedSectionNames),
    hasDebrief: row.hasDebrief ?? false,
    hasQuiz: row.hasQuiz,
    quizPlayed: row.quizPlayed,
    debriefBearing: row.debriefBearing ?? false,
    debriefPassed: row.debriefPassed,
    lastFailedDebriefAt: toIso(row.lastFailedDebriefAt),
    doneAt: toIso(row.doneAt),
    visited: row.visited,
  };
}
