import { sql } from 'drizzle-orm';
import {
  LESSON_VISIT_SECTION,
  TRACKED_SECTIONS_SQL_LIST,
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
   */
  applicableSections: sql<number>`coalesce((
    select
        (case when json_array_length(m.key_points) > 0 then 1 else 0 end)
      + (case when coalesce(m.pro_tips, '') <> '' then 1 else 0 end)
      + (case when coalesce(array_length(m.links, 1), 0) > 0 then 1 else 0 end)
      + (case when coalesce(m.assignments, '') <> '' then 1 else 0 end)
      + (case when coalesce(m.job_of_the_day, '') <> '' then 1 else 0 end)
    from lesson_material m
    where m.lesson_slug = ${lessonsTable.slug}
    limit 1
  ), 0)`,

  /**
   * Distinct tracked sections this learner has selected.
   *
   * A FILTER over the already-joined progress rows rather than a second join:
   * the same LEFT JOIN carries both the 'page' row and the section rows, and
   * DISTINCT keeps this correct even if that join ever multiplies.
   */
  tappedSections: sql<number>`count(distinct ${lessonMaterialProgressTable.sectionName})
    filter (where ${lessonMaterialProgressTable.completed}
      and ${lessonMaterialProgressTable.sectionName} in (${sql.raw(TRACKED_SECTIONS_SQL_LIST)}))`,

  /** The authored quiz has at least one question. Approximate — see the ledger. */
  hasQuiz: sql<boolean>`exists (
    select 1 from lesson_material m
    where m.lesson_slug = ${lessonsTable.slug}
      and json_array_length(m.quiz) > 0
  )`,

  /**
   * The debrief generator has what it needs. Mirrors `onDebrief`'s own guard
   * (`lesson-player-container.tsx`), which bails without key points and text —
   * so without this the lesson would carry a component whose button, when
   * pressed, silently does nothing.
   */
  canDebrief: sql<boolean>`exists (
    select 1 from lesson_material m
    where m.lesson_slug = ${lessonsTable.slug}
      and json_array_length(m.key_points) > 0
      and coalesce(m.text, '') <> ''
  )`,

  quizPlayed: sql<boolean>`exists (
    select 1 from lesson_quiz_answers q
    where q.user_id = ${userId} and q.lesson_slug = ${lessonsTable.slug}
  )`,

  /**
   * `completed_at IS NOT NULL`, not row existence: rows are only written on
   * full completion today (`debrief-quiz-container.tsx`), and testing the
   * column stops a future partial save from silently counting as answered.
   */
  debriefAnswered: sql<boolean>`exists (
    select 1 from lesson_test_results t
    where t.user_id = ${userId}
      and t.lesson_slug = ${lessonsTable.slug}
      and t.completed_at is not null
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
  applicableSections: number;
  tappedSections: number;
  hasQuiz: boolean;
  canDebrief: boolean;
  quizPlayed: boolean;
  debriefAnswered: boolean;
  visited: boolean;
};

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
    applicableSections: Number(row.applicableSections),
    tappedSections: Number(row.tappedSections),
    hasDebrief: row.hasDebrief ?? false,
    hasQuiz: row.hasQuiz,
    canDebrief: row.canDebrief,
    quizPlayed: row.quizPlayed,
    debriefAnswered: row.debriefAnswered,
    visited: row.visited,
  };
}
