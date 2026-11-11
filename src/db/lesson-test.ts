import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  type AIEvaluationResult,
  AIEvaluationResultSchema,
  type AITestQuestion,
  AITestSchema,
} from '#/ai/schemas';
import { db } from '#/db';
import {
  videoRewatchedAtSql,
  videoWatchedAtSql,
} from '#/db/progress-components';
import {
  DEBRIEF_PAR_SCORE,
  type DebriefFacts,
  debriefClockStart,
} from '#/lib/debrief-schedule';
import {
  lessonCompletionsTable,
  lessonsTable,
  lessonTestResultsTable,
} from './schema';

export async function saveTestResult(data: {
  userId: string;
  lessonSlug: string;
  questions: unknown;
  answers: unknown;
  totalScore: number;
}) {
  const [result] = await db
    .insert(lessonTestResultsTable)
    .values({
      userId: data.userId,
      lessonSlug: data.lessonSlug,
      questions: data.questions,
      answers: data.answers,
      totalScore: data.totalScore,
      completedAt: new Date(),
    })
    .returning();

  return result;
}

export async function getTestResults(userId: string, lessonSlug: string) {
  return db
    .select()
    .from(lessonTestResultsTable)
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        eq(lessonTestResultsTable.lessonSlug, lessonSlug),
      ),
    )
    .orderBy(desc(lessonTestResultsTable.createdAt));
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
  questions: AITestQuestion[];
  /** The pilot's answers and their evaluations. Empty if unreadable. */
  evaluations: AIEvaluationResult[];
};

const storedEvaluationsSchema = z.array(AIEvaluationResultSchema);

/**
 * Finished attempts WITH the data a score report renders — only for a pilot
 * who has passed (the status route's passed branch), since the history is
 * hidden until then. Same filter and order as `getDebriefAttempts`.
 *
 * `save-results` stores `questions` as the whole AITest (`{ lessonSlug,
 * questions }`) and `answers` as the evaluation array. A row whose JSON no
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
    const test = AITestSchema.safeParse(row.questions);
    const evaluations = storedEvaluationsSchema.safeParse(row.answers);
    return [
      {
        id: row.id,
        totalScore: row.totalScore,
        completedAt: row.completedAt.toISOString(),
        questions: test.success ? test.data.questions : [],
        evaluations: evaluations.success ? evaluations.data : [],
      },
    ];
  });
}

/**
 * The schedule facts for one pilot's debrief on one lesson — the route-side
 * twin of `debriefPassed`, `lastFailedDebriefAt`, `doneAt` and
 * `videoWatchedAt` in `progress-components.ts`, with the same rules:
 *
 * - passed: a completed attempt with `total_score >= DEBRIEF_PAR_SCORE`;
 * - lastFailedAt: the latest completed attempt with `total_score < par`,
 *   reported whether or not a pass also exists (the SQL selects both);
 * - clockStartAt: the earlier of the video's first full coverage (the same
 *   `videoWatchedAtSql` fragment) on a video lesson, else the sticky `lesson_completions.done_at`
 *   for (user, lesson id) — see `debriefClockStart`.
 *
 * The two must agree, or the lesson list would show a debrief the generate
 * route refuses to open, or the reverse.
 */
export async function getDebriefFacts(
  userId: string,
  lessonSlug: string,
  lessonId: number,
): Promise<DebriefFacts> {
  const [attempts, completions, watched] = await Promise.all([
    getDebriefAttempts(userId, lessonSlug),
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
    db
      .select({
        videoWatchedAt: videoWatchedAtSql(userId, lessonsTable.id),
        videoRewatchedAt: videoRewatchedAtSql(
          userId,
          lessonsTable.id,
          lessonsTable.slug,
        ),
        videoProvider: lessonsTable.videoProvider,
        videoRef: lessonsTable.videoRef,
      })
      .from(lessonsTable)
      .where(eq(lessonsTable.id, lessonId))
      .limit(1),
  ]);

  const failedMs = attempts
    .filter((a) => a.totalScore < DEBRIEF_PAR_SCORE)
    .map((a) => Date.parse(a.completedAt));
  const doneAt = completions[0]?.doneAt ?? null;
  // Raw `sql<Date>` columns: the driver hands back offset-bearing strings.
  const iso = (v: Date | string | null | undefined) =>
    v == null ? null : new Date(v).toISOString();
  const lesson = watched[0];
  // The same two columns the rollup's `hasVideo` reads.
  const hasVideo =
    (lesson?.videoProvider ?? null) !== null &&
    (lesson?.videoRef ?? null) !== null;

  return {
    clockStartAt: debriefClockStart({
      hasVideo,
      videoWatchedAt: iso(lesson?.videoWatchedAt),
      doneAt: doneAt === null ? null : doneAt.toISOString(),
    }),
    hasVideo,
    rewatchedAt: iso(lesson?.videoRewatchedAt),
    passed: attempts.some((a) => a.totalScore >= DEBRIEF_PAR_SCORE),
    lastFailedAt:
      failedMs.length === 0
        ? null
        : new Date(Math.max(...failedMs)).toISOString(),
  };
}
