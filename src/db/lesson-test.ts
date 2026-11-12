import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '#/db';
import {
  debriefFactColumns,
  toDebriefFactFields,
  toIso,
  videoWatchedAtSql,
} from '#/db/progress-components';
import {
  type ClientAttemptQuestion,
  type ClientEvaluation,
  toClientAttempt,
} from '#/lib/client-debrief-attempt';
import { DEBRIEF_ATTEMPT_FORMAT } from '#/lib/debrief-attempt-snapshot';
import { type DebriefFacts, debriefClockStart } from '#/lib/debrief-schedule';
import {
  lessonCompletionsTable,
  lessonsTable,
  lessonTestResultsTable,
} from './schema';

export type ClientTestResult = {
  id: number;
  lessonSlug: string;
  totalScore: number | null;
  completedAt: Date | null;
  createdAt: Date;
  format: string | null;
  finishedReason: 'all-answered' | 'all-cleared' | null;
  questions: ClientAttemptQuestion[];
  evaluations: ClientEvaluation[];
};

/**
 * This pilot's FINISHED attempts on a lesson, newest first, for the results
 * route. Never an open one, and every row goes through `toClientAttempt`: a
 * chunk-format row stores its grading key (expected answers, chunk tags and
 * summaries, context), which must never reach the pilot.
 */
export async function getTestResults(
  userId: string,
  lessonSlug: string,
): Promise<ClientTestResult[]> {
  const rows = await db
    .select()
    .from(lessonTestResultsTable)
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        eq(lessonTestResultsTable.lessonSlug, lessonSlug),
        isNotNull(lessonTestResultsTable.completedAt),
      ),
    )
    .orderBy(desc(lessonTestResultsTable.createdAt));
  return rows.map((row) => ({
    id: row.id,
    lessonSlug: row.lessonSlug,
    totalScore: row.totalScore,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    format: row.format,
    finishedReason: row.finishedReason,
    ...toClientAttempt(row),
  }));
}

export type DebriefAttempt = {
  id: number;
  totalScore: number;
  /** ISO instant (UTC). */
  completedAt: string;
};

/**
 * This pilot's finished debrief attempts on one lesson, newest first.
 *
 * Completed AND scored only. A row with no `completed_at` is a partial save
 * and never counts, as in the progress SQL; a completed row with no score
 * counts as neither a pass nor a failure there (`null >= 70` and `null < 70`
 * are both null), so leaving it out here changes no fact derived from it.
 *
 * `completed_at` is a timezone-less `timestamp` holding UTC wall time. Read
 * through the drizzle column (never a raw `sql` fragment), it is mapped by
 * appending `+0000`, so `toISOString()` below is the true UTC instant.
 */
export async function getDebriefAttempts(
  userId: string,
  lessonSlug: string,
): Promise<DebriefAttempt[]> {
  const rows = await db
    .select({
      id: lessonTestResultsTable.id,
      totalScore: lessonTestResultsTable.totalScore,
      completedAt: lessonTestResultsTable.completedAt,
    })
    .from(lessonTestResultsTable)
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        eq(lessonTestResultsTable.lessonSlug, lessonSlug),
        isNotNull(lessonTestResultsTable.completedAt),
        isNotNull(lessonTestResultsTable.totalScore),
      ),
    )
    .orderBy(
      desc(lessonTestResultsTable.completedAt),
      desc(lessonTestResultsTable.id),
    );

  return rows.flatMap((row) =>
    row.completedAt !== null && row.totalScore !== null
      ? [
          {
            id: row.id,
            totalScore: row.totalScore,
            completedAt: row.completedAt.toISOString(),
          },
        ]
      : [],
  );
}

export type DebriefAttemptReport = DebriefAttempt & {
  /** The questions asked, as saved. Empty if the stored JSON is unreadable. */
  questions: ClientAttemptQuestion[];
  /** The pilot's answers and their grades. Empty if unreadable. */
  evaluations: ClientEvaluation[];
  /** Whether THIS attempt passed — see `attemptPassed`. */
  passed: boolean;
};

/**
 * Legacy pass mark, kept only to label attempts saved before chunk mastery.
 * The migration backfilled every such pass into `debrief_passes` with it.
 */
const LEGACY_PASS_SCORE = 75;

/**
 * A chunk attempt passed when it cleared every chunk (`all-cleared`); its
 * score alone cannot say so, since an attempt that finished with a hole left
 * scores its mastery percent (6 of 7 = 86). A legacy attempt passed at 75.
 */
function attemptPassed(
  format: string | null,
  finishedReason: string | null,
  totalScore: number,
): boolean {
  return format === null
    ? totalScore >= LEGACY_PASS_SCORE
    : finishedReason === 'all-cleared';
}

/**
 * Finished attempts WITH the data a score report renders — only for a pilot
 * who has passed (the status route's passed branch), since the history is
 * hidden until then. Same filter and order as `getDebriefAttempts`.
 *
 * `questions` holds the whole AITest (`{ lessonSlug, questions }`; a chunk
 * attempt adds its chunks and context, which are dropped here) and `answers`
 * the evaluation array. A row whose JSON no
 * longer parses keeps its score and date with empty arrays rather than
 * dropping out of the history.
 */
export async function getDebriefAttemptReports(
  userId: string,
  lessonSlug: string,
): Promise<DebriefAttemptReport[]> {
  const rows = await db
    .select({
      id: lessonTestResultsTable.id,
      totalScore: lessonTestResultsTable.totalScore,
      completedAt: lessonTestResultsTable.completedAt,
      questions: lessonTestResultsTable.questions,
      answers: lessonTestResultsTable.answers,
      format: lessonTestResultsTable.format,
      finishedReason: lessonTestResultsTable.finishedReason,
    })
    .from(lessonTestResultsTable)
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        eq(lessonTestResultsTable.lessonSlug, lessonSlug),
        isNotNull(lessonTestResultsTable.completedAt),
        isNotNull(lessonTestResultsTable.totalScore),
      ),
    )
    .orderBy(
      desc(lessonTestResultsTable.completedAt),
      desc(lessonTestResultsTable.id),
    );

  return rows.flatMap((row) => {
    if (row.completedAt === null || row.totalScore === null) return [];
    return [
      {
        id: row.id,
        totalScore: row.totalScore,
        completedAt: row.completedAt.toISOString(),
        // Projected: the stored JSON holds the grading key.
        ...toClientAttempt(row),
        passed: attemptPassed(row.format, row.finishedReason, row.totalScore),
      },
    ];
  });
}

/**
 * This pilot's latest FINISHED chunk-format attempt on a lesson, as stored —
 * `questions` holds the grading key. Callers project it with
 * `toClientAttempt` before anything reaches the pilot. Null when the pilot
 * has none (no attempt yet, or only legacy ones).
 */
export async function selectLatestFinishedChunkAttempt(
  userId: string,
  lessonSlug: string,
): Promise<{ questions: unknown; answers: unknown } | null> {
  const [row] = await db
    .select({
      questions: lessonTestResultsTable.questions,
      answers: lessonTestResultsTable.answers,
    })
    .from(lessonTestResultsTable)
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        eq(lessonTestResultsTable.lessonSlug, lessonSlug),
        eq(lessonTestResultsTable.format, DEBRIEF_ATTEMPT_FORMAT),
        isNotNull(lessonTestResultsTable.completedAt),
      ),
    )
    .orderBy(
      desc(lessonTestResultsTable.completedAt),
      desc(lessonTestResultsTable.id),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The schedule facts for one pilot's debrief on one lesson — the route-side
 * twin of the progress rollup in `progress-components.ts`, with the same
 * rules. The two must agree, or the lesson list would show a debrief the
 * start route refuses to open, or the reverse.
 *
 * - passed: a row in `debrief_passes` (permanent; legacy passes backfilled);
 * - lastFinishedAt: the latest `completed_at` over ALL this pilot's attempts
 *   on the lesson, legacy ones included, so a pilot with only old below-par
 *   attempts waits 6h from the last of them;
 * - hasOpenAttempt: an unfinished chunk-format attempt exists;
 * - mastery: cleared of total against the lesson's CURRENT chunk list, or
 *   null when the lesson has no chunks stored yet;
 * - clockStartAt: the video's first full coverage (the shared
 *   `videoWatchedAtSql` fragment) on a video lesson, else the sticky
 *   `lesson_completions.done_at` — see `debriefClockStart`.
 */
export async function getDebriefFacts(
  userId: string,
  lessonSlug: string,
  lessonId: number,
): Promise<DebriefFacts> {
  const [completions, lessonRows] = await Promise.all([
    db
      .select({ doneAt: lessonCompletionsTable.doneAt })
      .from(lessonCompletionsTable)
      .where(
        and(
          eq(lessonCompletionsTable.userId, userId),
          eq(lessonCompletionsTable.lessonId, lessonId),
        ),
      )
      .limit(1),
    // From `lessons` alone, with the same fact columns the progress rollup
    // selects: the two cannot disagree about passed / finished / open /
    // mastery, nor about when the video was watched.
    db
      .select({
        ...debriefFactColumns(userId),
        videoWatchedAt: videoWatchedAtSql(userId, lessonsTable.id),
        videoProvider: lessonsTable.videoProvider,
        videoRef: lessonsTable.videoRef,
      })
      .from(lessonsTable)
      // The fact fragments key on `lessons.slug`; pin it to the slug asked for.
      .where(
        and(eq(lessonsTable.id, lessonId), eq(lessonsTable.slug, lessonSlug)),
      )
      .limit(1),
  ]);

  const doneAt = completions[0]?.doneAt ?? null;
  const lesson = lessonRows[0];
  // The same two columns the rollup's `hasVideo` reads.
  const hasVideo =
    (lesson?.videoProvider ?? null) !== null &&
    (lesson?.videoRef ?? null) !== null;

  return {
    clockStartAt: debriefClockStart({
      hasVideo,
      videoWatchedAt: toIso(lesson?.videoWatchedAt),
      doneAt: doneAt === null ? null : doneAt.toISOString(),
    }),
    ...toDebriefFactFields(
      lesson ?? {
        debriefPassed: false,
        lastFinishedDebriefAt: null,
        hasOpenDebrief: false,
        chunksCleared: 0,
        chunksTotal: null,
      },
    ),
  };
}
