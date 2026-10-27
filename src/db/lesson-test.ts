import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '#/db';
import { DEBRIEF_PAR_SCORE, type DebriefFacts } from '#/lib/debrief-schedule';
import { lessonCompletionsTable, lessonTestResultsTable } from './schema';

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

/**
 * The schedule facts for one pilot's debrief on one lesson — the route-side
 * twin of `debriefPassed`, `lastFailedDebriefAt` and `doneAt` in
 * `progress-components.ts`, with the same rules:
 *
 * - passed: a completed attempt with `total_score >= DEBRIEF_PAR_SCORE`;
 * - lastFailedAt: the latest completed attempt with `total_score < par`,
 *   reported whether or not a pass also exists (the SQL selects both);
 * - doneAt: the sticky `lesson_completions.done_at` for (user, lesson id).
 *
 * The two must agree, or the lesson list would show a debrief the generate
 * route refuses to open, or the reverse.
 */
export async function getDebriefFacts(
  userId: string,
  lessonSlug: string,
  lessonId: number,
): Promise<DebriefFacts> {
  const [attempts, completions] = await Promise.all([
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
  ]);

  const failedMs = attempts
    .filter((a) => a.totalScore < DEBRIEF_PAR_SCORE)
    .map((a) => Date.parse(a.completedAt));
  const doneAt = completions[0]?.doneAt ?? null;

  return {
    doneAt: doneAt === null ? null : doneAt.toISOString(),
    passed: attempts.some((a) => a.totalScore >= DEBRIEF_PAR_SCORE),
    lastFailedAt:
      failedMs.length === 0
        ? null
        : new Date(Math.max(...failedMs)).toISOString(),
  };
}
