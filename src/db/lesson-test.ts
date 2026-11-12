import { and, desc, eq, isNotNull, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  type AIEvaluationResult,
  AIEvaluationResultSchema,
  type AITestQuestion,
  AITestSchema,
} from '#/ai/schemas';
import { db } from '#/db';
import { videoWatchedAtSql } from '#/db/progress-components';
import { DEBRIEF_ATTEMPT_FORMAT } from '#/lib/debrief-attempt-snapshot';
import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import { type DebriefFacts, debriefClockStart } from '#/lib/debrief-schedule';
import {
  debriefChunkMasteryTable,
  debriefPassesTable,
  lessonCompletionsTable,
  lessonKnowledgeChunksTable,
  lessonsTable,
  lessonTestResultsTable,
} from './schema';

/**
 * This pilot's FINISHED attempts on a lesson, newest first. Never an open
 * one: an open chunk-format attempt stores its expected answers, chunks and
 * context for grading, and the pilot must not be able to read them mid-attempt.
 */
export async function getTestResults(userId: string, lessonSlug: string) {
  return db
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
function attemptPassed(row: {
  format: string | null;
  finishedReason: string | null;
  totalScore: number;
}): boolean {
  return row.format === null
    ? row.totalScore >= LEGACY_PASS_SCORE
    : row.finishedReason === 'all-cleared';
}

const storedEvaluationsSchema = z.array(AIEvaluationResultSchema);

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
    const test = AITestSchema.safeParse(row.questions);
    const evaluations = storedEvaluationsSchema.safeParse(row.answers);
    return [
      {
        id: row.id,
        totalScore: row.totalScore,
        completedAt: row.completedAt.toISOString(),
        questions: test.success ? test.data.questions : [],
        evaluations: evaluations.success ? evaluations.data : [],
        passed: attemptPassed({ ...row, totalScore: row.totalScore }),
      },
    ];
  });
}

/**
 * Cleared rows counted against the current list only: ids are
 * version-scoped (`v2-c3`), so an older version's row never matches.
 */
function clearedOfCurrent(
  chunks: KnowledgeChunk[],
  cleared: { chunkId: string }[],
): { cleared: number; total: number } {
  const current = new Set(chunks.map((c) => c.id));
  return {
    cleared: cleared.filter((r) => current.has(r.chunkId)).length,
    total: chunks.length,
  };
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
  const [attempts, passes, completions, watched, chunkRows, clearedRows] =
    await Promise.all([
      db
        .select({
          lastFinishedAt: max(lessonTestResultsTable.completedAt),
          hasOpen: sql<
            boolean | null
          >`bool_or(${lessonTestResultsTable.completedAt} is null and ${lessonTestResultsTable.format} = ${DEBRIEF_ATTEMPT_FORMAT})`,
        })
        .from(lessonTestResultsTable)
        .where(
          and(
            eq(lessonTestResultsTable.userId, userId),
            eq(lessonTestResultsTable.lessonSlug, lessonSlug),
          ),
        ),
      db
        .select({ id: debriefPassesTable.id })
        .from(debriefPassesTable)
        .where(
          and(
            eq(debriefPassesTable.userId, userId),
            eq(debriefPassesTable.lessonSlug, lessonSlug),
          ),
        )
        .limit(1),
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
          videoProvider: lessonsTable.videoProvider,
          videoRef: lessonsTable.videoRef,
        })
        .from(lessonsTable)
        .where(eq(lessonsTable.id, lessonId))
        .limit(1),
      db
        .select({
          version: lessonKnowledgeChunksTable.version,
          chunks: lessonKnowledgeChunksTable.chunks,
        })
        .from(lessonKnowledgeChunksTable)
        .where(eq(lessonKnowledgeChunksTable.lessonId, lessonId))
        .limit(1),
      db
        .select({ chunkId: debriefChunkMasteryTable.chunkId })
        .from(debriefChunkMasteryTable)
        .where(
          and(
            eq(debriefChunkMasteryTable.userId, userId),
            eq(debriefChunkMasteryTable.lessonId, lessonId),
            isNotNull(debriefChunkMasteryTable.clearedAt),
          ),
        ),
    ]);

  const doneAt = completions[0]?.doneAt ?? null;
  // Raw `sql<Date>` columns: the driver hands back offset-bearing strings.
  const iso = (v: Date | string | null | undefined) =>
    v == null ? null : new Date(v).toISOString();
  const lesson = watched[0];
  // The same two columns the rollup's `hasVideo` reads.
  const hasVideo =
    (lesson?.videoProvider ?? null) !== null &&
    (lesson?.videoRef ?? null) !== null;
  const chunkRow = chunkRows[0];

  return {
    clockStartAt: debriefClockStart({
      hasVideo,
      videoWatchedAt: iso(lesson?.videoWatchedAt),
      doneAt: doneAt === null ? null : doneAt.toISOString(),
    }),
    passed: passes.length > 0,
    // `max` over the drizzle column keeps its mapping (UTC wall time + 0000).
    lastFinishedAt: iso(attempts[0]?.lastFinishedAt),
    hasOpenAttempt: attempts[0]?.hasOpen === true,
    mastery: chunkRow ? clearedOfCurrent(chunkRow.chunks, clearedRows) : null,
  };
}
