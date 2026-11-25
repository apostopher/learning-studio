import { Column, getTableName, is, type SQL, sql } from 'drizzle-orm';
import { attemptIsOfSnapshot } from '#/db/attempt-version';
import {
  courseLessonVersionsTable,
  lessonMaterialProgressTable,
  lessonsTable,
  lessonVersionsTable,
} from '#/db/schema';
import { watchedMilestones } from '#/lib/course-milestones';
import { DEBRIEF_ATTEMPT_FORMAT } from '#/lib/debrief-attempt-snapshot';
import { debriefPassedOf, masteryFromCounts } from '#/lib/debrief-mastery';
import { FLAGSHIP_DISCIPLINE_SLUG } from '#/lib/flagship-course';
import {
  isTrackedLessonSection,
  LESSON_VISIT_SECTION,
  TRACKED_LESSON_SECTIONS,
  TRACKED_SECTIONS_SQL_LIST,
  type TrackedLessonSection,
} from '#/lib/lesson-visit-section';

/**
 * The component facts both progress queries select, in one place.
 *
 * `getCourseProgress` (one course) and `getMyCourses` (every subscribed course)
 * feed the same aggregator from different queries. Anything that lives in only
 * one of them makes a course card disagree with its own sidebar, so the shared
 * parts live here and both spread them.
 *
 * What the lesson ASKS for (video, tabs, quiz, debrief source) is read from the
 * course's snapshot, `lesson_versions`, so both queries LEFT JOIN the pin and
 * then the snapshot right after `lessons`. What the learner has DONE is keyed
 * on the lesson, and so survives the course moving to another version.
 *
 * Everything is reduced to a boolean or an integer IN POSTGRES. A sidebar
 * render must not pull lesson body text or quiz JSON across the wire just to
 * learn whether a quiz exists.
 */

/**
 * When this learner finished watching the lesson's video: the moment the LAST
 * watched-milestone (10..95, see `isVideoWatched`) was first reached. Null
 * until every one has been. `videos_progress` is append-only, so a milestone's
 * first hit never moves, and neither does this.
 *
 * Starts the debrief clock (`debriefClockStart`). Shared by the progress
 * rollup and `getDebriefFacts`, so the lesson list and the debrief routes
 * cannot disagree about when the debrief opens.
 *
 * `created_at` is a timezone-less timestamp written by `now()`;
 * `at time zone 'UTC'` makes the raw string carry an offset so `toIso` cannot
 * read it as local time.
 */
export const videoWatchedAtSql = (
  userId: string,
  lessonId: SQL | typeof lessonsTable.id | number,
) => fullWatchAtSql(userId, lessonId);

/**
 * A column from the OUTER query, always table-qualified. In a single-table
 * select drizzle renders a column bare (`"id"`), and inside these subqueries
 * Postgres binds a bare name to the nearest scope — `videos_progress.id`, not
 * `lessons.id` — so the watch was never found and every video lesson's
 * debrief stayed locked (`getDebriefFacts`, prod 2026-11-12).
 */
const outerRef = (value: SQL | Column | number | string) =>
  is(value, Column)
    ? sql`${sql.identifier(getTableName(value.table))}.${sql.identifier(value.name)}`
    : sql`${value}`;

type LessonSlugRef = SQL | typeof lessonsTable.slug | string;
type LessonVersionIdRef = SQL | typeof lessonVersionsTable.id | number;

/**
 * Is the lesson filed under the 3D Airmanship discipline? By the discipline's
 * slug, which a rename leaves alone. Also whether levels gate it
 * (`LevelFilterableLesson`). Select from `lessons`.
 */
export const flagshipDisciplineSql = () =>
  sql<boolean>`coalesce((
    select d.slug = ${FLAGSHIP_DISCIPLINE_SLUG} from disciplines d
    where d.id = ${outerRef(lessonsTable.disciplineId)}
  ), false)`;

/** A row in `debrief_passes` (permanent; legacy passes were backfilled). */
export const debriefPassedSql = (userId: string, lessonSlug: LessonSlugRef) =>
  sql<boolean>`exists (
    select 1 from debrief_passes p
    where p.user_id = ${userId}
      and p.lesson_slug = ${outerRef(lessonSlug)}
  )`;

/**
 * Latest `completed_at` over this pilot's attempts on the version the course
 * shows, legacy rows included, so a pilot with only old below-par attempts is
 * offered a retake (at once: there is no retake wait). An unpassed debrief
 * starts over on another version: its finished attempts there do not count.
 * `completed_at` is timezone-less and written as UTC;
 * `at time zone 'UTC'` makes the raw string carry an offset so `toIso` cannot
 * read it as local time.
 */
export const lastFinishedDebriefAtSql = (
  userId: string,
  lessonSlug: LessonSlugRef,
) =>
  sql<Date | null>`(
    select max(t.completed_at) at time zone 'UTC' from lesson_test_results t
    where t.user_id = ${userId}
      and t.lesson_slug = ${outerRef(lessonSlug)}
      and t.completed_at is not null
      and ${attemptIsOfSnapshot('t')}
  )`;

/** The pilot has finished an attempt on the lesson, on any version: the wait is behind them. */
export const debriefWaitServedSql = (
  userId: string,
  lessonSlug: LessonSlugRef,
) =>
  sql<boolean>`exists (
    select 1 from lesson_test_results t
    where t.user_id = ${userId}
      and t.lesson_slug = ${outerRef(lessonSlug)}
      and t.completed_at is not null
  )`;

/** An unfinished chunk-format attempt exists, whatever version it is of. */
export const hasOpenDebriefSql = (userId: string, lessonSlug: LessonSlugRef) =>
  sql<boolean>`exists (
    select 1 from lesson_test_results t
    where t.user_id = ${userId}
      and t.lesson_slug = ${outerRef(lessonSlug)}
      and t.completed_at is null
      and t.format = ${DEBRIEF_ATTEMPT_FORMAT}
  )`;

/**
 * Chunks this pilot has cleared of the snapshot's CURRENT list. Chunk ids carry
 * the list's number (`v2-c3`), unique across the lesson's snapshots, so rows of
 * an older list, or of another snapshot's, never match.
 */
export const chunksClearedSql = (
  userId: string,
  lessonVersionId: LessonVersionIdRef,
) =>
  sql<number>`coalesce((
    select count(*)::int from debrief_chunk_mastery m
    join lesson_knowledge_chunks k on k.lesson_id = m.lesson_id
    where m.user_id = ${userId}
      and k.lesson_version_id = ${outerRef(lessonVersionId)}
      and m.cleared_at is not null
      and m.chunk_id like 'v' || k.version || '-%'
  ), 0)`;

/** Length of the snapshot's stored chunk list; null when it has none yet. */
export const chunksTotalSql = (lessonVersionId: LessonVersionIdRef) =>
  sql<number | null>`(
    select jsonb_array_length(k.chunks) from lesson_knowledge_chunks k
    where k.lesson_version_id = ${outerRef(lessonVersionId)}
  )`;

/** The snapshot has stored chunks (so its debrief exists for every pilot). */
export const hasChunksSql = (lessonVersionId: LessonVersionIdRef) =>
  sql<boolean>`exists (
    select 1 from lesson_knowledge_chunks k
    where k.lesson_version_id = ${outerRef(lessonVersionId)}
  )`;

/**
 * The debrief schedule facts, selected identically by the progress rollup and
 * by `getDebriefFacts`, so the sidebar ring and the debrief routes read the
 * same SQL and cannot disagree. Select from `lessons` joined to the course's
 * snapshot.
 */
export const debriefFactColumns = (userId: string) => ({
  debriefPassed: debriefPassedSql(userId, lessonsTable.slug),
  lastFinishedDebriefAt: lastFinishedDebriefAtSql(userId, lessonsTable.slug),
  hasOpenDebrief: hasOpenDebriefSql(userId, lessonsTable.slug),
  debriefWaitServed: debriefWaitServedSql(userId, lessonsTable.slug),
  chunksCleared: chunksClearedSql(userId, lessonVersionsTable.id),
  chunksTotal: chunksTotalSql(lessonVersionsTable.id),
});

type DebriefFactRow = {
  debriefPassed: boolean;
  lastFinishedDebriefAt: Date | string | null;
  hasOpenDebrief: boolean;
  debriefWaitServed: boolean;
  chunksCleared: number;
  chunksTotal: number | null;
};

/** Raw `sql<Date>` columns come back as ISO-ish strings from the driver, Dates elsewhere. */
export function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/** The fact columns as `DebriefFacts` minus the clock (which needs video/done). */
export function toDebriefFactFields(row: DebriefFactRow) {
  return {
    passed: debriefPassedOf(row),
    lastFinishedAt: toIso(row.lastFinishedDebriefAt),
    hasOpenAttempt: row.hasOpenDebrief,
    waitServed: row.debriefWaitServed,
    mastery: masteryFromCounts(row.chunksCleared, row.chunksTotal),
  };
}

/** Both raw timestamps are `now()`-written and timezone-less, so they compare directly. */
const fullWatchAtSql = (
  userId: string,
  lessonId: SQL | typeof lessonsTable.id | number,
) => sql<Date | null>`(
  select case when count(*) = ${watchedMilestones.length}
    then max(f.first_at) at time zone 'UTC' end
  from (
    select min(v.created_at) as first_at from videos_progress v
    where v.user_id = ${userId}
      and v.lesson_id = ${outerRef(lessonId)}
      and v.progress in (${sql.raw(watchedMilestones.join(', '))})
    group by v.progress
  ) f
)`;

/**
 * Correlated EXISTS/scalar subqueries rather than joins, deliberately.
 *
 * Joining `lesson_quiz_answers` (one row per attempt) and
 * `lesson_test_results` (one per debrief) would multiply against the ≤18
 * video-progress rows and ≤6 section rows already joined per lesson. On a 100-lesson course that
 * is tens of thousands of intermediate rows to aggregate away. A scalar
 * subquery is evaluated once per lesson and cannot multiply anything; both
 * tables carry a (user_id, lesson_slug) index for it to ride.
 */
export const progressComponentColumns = (userId: string) => ({
  /**
   * The SNAPSHOT's lesson, not `lessons.id`: null for a lesson the course has
   * no version of, as for a module with no lessons. The payload leaves such a
   * lesson out (`getCourseDetails`), so it must not count.
   */
  lessonId: lessonVersionsTable.lessonId,
  videoProvider: lessonVersionsTable.videoProvider,
  videoRef: lessonVersionsTable.videoRef,
  needsVideoWatch: lessonsTable.needsVideoWatch,
  hasDebrief: lessonsTable.hasDebrief,

  /**
   * Tabs with content behind them. `json_array_length(NULL)` is NULL and
   * `NULL > 0` is NULL, so an unset column, or no snapshot at all, falls
   * through every CASE — a lesson with no material asks for no sections.
   *
   * The closing tab counts by the snapshot's `extra_tab`, the tab the learner
   * is shown. Counting whichever column is filled would let a stray value
   * demand a tab they never see, and the lesson could then never complete.
   */
  applicableSectionNames: sql<string[]>`array_remove(array[
    (case when json_array_length(${lessonVersionsTable.keyPoints}) > 0 then 'keyPoints' end),
    (case when coalesce(${lessonVersionsTable.proTips}, '') <> '' then 'proTips' end),
    (case when json_array_length(${lessonVersionsTable.links}) > 0 then 'links' end),
    (case when coalesce(${lessonVersionsTable.assignments}, '') <> '' then 'assignments' end),
    (case when ${lessonVersionsTable.extraTab} = 'jobOfTheDay'
      then (case when coalesce(${lessonVersionsTable.jobOfTheDay}, '') <> '' then 'jobOfTheDay' end)
      else (case when json_array_length(${lessonVersionsTable.testThis}) > 0 then 'testThis' end)
    end)
  ], null)`,

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

  /**
   * The authored quiz has at least one question. `selectAuthoredQuiz` (the
   * debrief judge) reads the same snapshot. Approximate — see the ledger.
   */
  hasQuiz: sql<boolean>`coalesce(json_array_length(${lessonVersionsTable.quiz}) > 0, false)`,

  /**
   * Whether the debrief counts toward the COURSE percent (call 11).
   *
   * The switch is on AND the snapshot has something to debrief from: authored
   * body text, or a video with a sign that its captions are usable — the
   * server has already produced a debrief for this pilot (prepared in this
   * course, or taken), or the snapshot has stored knowledge chunks.
   * A transcript-only debrief therefore becomes bearing only once one really
   * exists, so a lesson whose captions turn out unusable never blocks
   * course-done. Nor does what a pilot did on an older version, once the
   * version shown has neither text nor video and so no debrief to take.
   */
  debriefBearing: sql<boolean>`(${lessonsTable.hasDebrief} and (
    coalesce(${lessonVersionsTable.text}, '') <> ''
    or (${lessonVersionsTable.videoProvider} is not null
      and ${lessonVersionsTable.videoRef} is not null
      and (
        exists (
          select 1 from prepared_debriefs p
          where p.user_id = ${userId}
            and p.course_id = ${outerRef(courseLessonVersionsTable.courseId)}
            and p.lesson_slug = ${outerRef(lessonsTable.slug)}
        )
        or exists (
          select 1 from lesson_test_results t
          where t.user_id = ${userId} and t.lesson_slug = ${outerRef(lessonsTable.slug)}
        )
        or ${hasChunksSql(lessonVersionsTable.id)}
      )
    )
  ))`,

  /**
   * A 3D Airmanship lesson, by DISCIPLINE, which is not versioned: its ring
   * closes on the quiz, the debrief being optional there.
   */
  flagshipDiscipline: flagshipDisciplineSql(),

  quizPlayed: sql<boolean>`exists (
    select 1 from lesson_quiz_answers q
    where q.user_id = ${userId} and q.lesson_slug = ${lessonsTable.slug}
  )`,

  ...debriefFactColumns(userId),

  /** When the lesson first reached 100% for this learner (sticky). */
  doneAt: sql<Date | null>`(
    select c.done_at from lesson_completions c
    where c.user_id = ${userId} and c.lesson_id = ${lessonsTable.id}
  )`,

  /** When the video was finished; starts the debrief clock. See videoWatchedAtSql. */
  videoWatchedAt: videoWatchedAtSql(userId, lessonsTable.id),

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
 *
 * `lesson_versions.id` is its primary key and carries the rest of the
 * snapshot's columns, the `json` ones included: those cannot be listed, having
 * no equality.
 */
export const progressComponentGroupBy = [
  lessonsTable.slug,
  lessonsTable.needsVideoWatch,
  lessonsTable.hasDebrief,
  courseLessonVersionsTable.courseId,
  lessonVersionsTable.id,
  lessonVersionsTable.lessonId,
  lessonVersionsTable.videoProvider,
  lessonVersionsTable.videoRef,
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
  flagshipDiscipline: boolean | null;
  debriefPassed: boolean;
  lastFinishedDebriefAt: Date | string | null;
  hasOpenDebrief: boolean;
  debriefWaitServed: boolean;
  chunksCleared: number;
  chunksTotal: number | null;
  doneAt: Date | string | null;
  videoWatchedAt: Date | string | null;
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

/**
 * Map a selected row to the aggregator's component fields.
 *
 * The booleans are nullable in TS because the lessons table is LEFT JOINed for
 * the empty-module placeholder; a row with no `lessonId` is discarded by the
 * aggregator, so the defaults here only ever apply to a row nobody scores.
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
    flagshipDiscipline: row.flagshipDiscipline ?? false,
    debriefPassed: row.debriefPassed,
    lastFinishedDebriefAt: toIso(row.lastFinishedDebriefAt),
    hasOpenDebrief: row.hasOpenDebrief,
    debriefWaitServed: row.debriefWaitServed,
    chunksCleared: row.chunksCleared,
    chunksTotal: row.chunksTotal,
    doneAt: toIso(row.doneAt),
    videoWatchedAt: toIso(row.videoWatchedAt),
    visited: row.visited,
  };
}
