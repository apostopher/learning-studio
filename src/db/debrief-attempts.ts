import { and, eq, isNull, sql } from 'drizzle-orm';
import { AITestSchema } from '#/ai/schemas';
import { db } from '#/db';
import type { AnswerMetrics } from '#/lib/answer-metrics';
import {
  DEBRIEF_ATTEMPT_FORMAT,
  type StoredAttempt,
} from '#/lib/debrief-attempt-snapshot';
import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import {
  type DebriefChunkMasterySelect,
  debriefAnswerLogsTable,
  debriefChunkMasteryTable,
  debriefPassesTable,
  lessonKnowledgeChunksTable,
  lessonTestResultsTable,
} from './schema';

/** `db` or a transaction handle. */
export type Tx = Pick<typeof db, 'select' | 'insert' | 'update'>;

export type AttemptRow = typeof lessonTestResultsTable.$inferSelect;

/** Unfinished and chunk-format: the conditions of an OPEN attempt. */
const openAttempt = () => [
  isNull(lessonTestResultsTable.completedAt),
  eq(lessonTestResultsTable.format, DEBRIEF_ATTEMPT_FORMAT),
];

/** This pilot's unfinished chunk-format attempt on the lesson, if any. */
export async function selectOpenAttempt(
  userId: string,
  lessonSlug: string,
): Promise<AttemptRow | null> {
  const [row] = await db
    .select()
    .from(lessonTestResultsTable)
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        eq(lessonTestResultsTable.lessonSlug, lessonSlug),
        ...openAttempt(),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Insert a new open attempt. Null when the one-open-attempt index refused it:
 * a concurrent start got there first, and the caller resumes that one.
 */
export async function insertAttempt(v: {
  userId: string;
  lessonSlug: string;
  stored: StoredAttempt;
  chunkVersion: number;
}): Promise<AttemptRow | null> {
  const [row] = await db
    .insert(lessonTestResultsTable)
    .values({
      userId: v.userId,
      lessonSlug: v.lessonSlug,
      questions: v.stored,
      answers: [],
      format: DEBRIEF_ATTEMPT_FORMAT,
      chunkVersion: v.chunkVersion,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function selectAttempt(
  attemptId: number,
): Promise<AttemptRow | null> {
  const [row] = await db
    .select()
    .from(lessonTestResultsTable)
    .where(eq(lessonTestResultsTable.id, attemptId))
    .limit(1);
  return row ?? null;
}

/**
 * The attempt row, locked (`for update`) until the transaction ends, so two
 * answers to it commit one after the other and the second sees the first.
 */
export async function lockAttempt(
  tx: Tx,
  attemptId: number,
): Promise<AttemptRow | null> {
  const [row] = await tx
    .select()
    .from(lessonTestResultsTable)
    .where(eq(lessonTestResultsTable.id, attemptId))
    .for('update');
  return row ?? null;
}

export async function updateAttempt(
  tx: Tx,
  attemptId: number,
  set: Partial<
    Pick<
      AttemptRow,
      'answers' | 'draft' | 'completedAt' | 'totalScore' | 'finishedReason'
    >
  >,
): Promise<void> {
  await tx
    .update(lessonTestResultsTable)
    .set(set)
    .where(eq(lessonTestResultsTable.id, attemptId));
}

/**
 * Write the in-progress answer, only on the pilot's OWN UNFINISHED
 * chunk-format attempt. False when nothing matched (another pilot's attempt,
 * a finished one, or none).
 */
export async function updateDraft(
  userId: string,
  attemptId: number,
  draft: { questionId: string; text: string },
): Promise<boolean> {
  const rows = await db
    .update(lessonTestResultsTable)
    .set({ draft })
    .where(
      and(
        eq(lessonTestResultsTable.id, attemptId),
        eq(lessonTestResultsTable.userId, userId),
        ...openAttempt(),
      ),
    )
    .returning({ id: lessonTestResultsTable.id });
  return rows.length > 0;
}

/** The lesson's current chunk list, or null when none is stored. */
export async function selectCurrentChunks(
  lessonId: number,
  ex: Tx = db,
): Promise<{
  version: number;
  chunks: KnowledgeChunk[];
  previousMapping: Record<string, string | null> | null;
} | null> {
  const [row] = await ex
    .select({
      version: lessonKnowledgeChunksTable.version,
      chunks: lessonKnowledgeChunksTable.chunks,
      previousMapping: lessonKnowledgeChunksTable.previousMapping,
    })
    .from(lessonKnowledgeChunksTable)
    .where(eq(lessonKnowledgeChunksTable.lessonId, lessonId))
    .limit(1);
  return row ?? null;
}

/** Every mastery row of this pilot on the lesson, any chunk version. */
export async function selectMastery(
  userId: string,
  lessonId: number,
  ex: Tx = db,
): Promise<DebriefChunkMasterySelect[]> {
  return ex
    .select()
    .from(debriefChunkMasteryTable)
    .where(
      and(
        eq(debriefChunkMasteryTable.userId, userId),
        eq(debriefChunkMasteryTable.lessonId, lessonId),
      ),
    );
}

/**
 * Record new chunk scores. `latestScore` is always the newest; an existing
 * `clearedAt` is never cleared (cleared stays cleared), whatever the caller
 * passes.
 */
export async function upsertMastery(
  tx: Tx,
  rows: {
    userId: string;
    lessonId: number;
    chunkId: string;
    latestScore: number;
    clearedAt: Date | null;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx
    .insert(debriefChunkMasteryTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        debriefChunkMasteryTable.userId,
        debriefChunkMasteryTable.lessonId,
        debriefChunkMasteryTable.chunkId,
      ],
      set: {
        latestScore: sql`excluded.latest_score`,
        clearedAt: sql`coalesce(${debriefChunkMasteryTable.clearedAt}, excluded.cleared_at)`,
        updatedAt: sql`now()`,
      },
    });
}

/** One log per (attempt, question); a duplicate is ignored. */
export async function insertAnswerLog(
  tx: Tx,
  v: { attemptId: number; questionId: string; metrics: AnswerMetrics },
): Promise<void> {
  await tx.insert(debriefAnswerLogsTable).values(v).onConflictDoNothing();
}

/** A permanent pass; inserting it twice is a no-op. */
export async function insertPass(
  tx: Tx,
  v: { userId: string; lessonSlug: string },
): Promise<void> {
  await tx.insert(debriefPassesTable).values(v).onConflictDoNothing();
}

/**
 * The text of every question this pilot has been asked on the lesson, in any
 * attempt and either format, so a new attempt never repeats one. Rows that no
 * longer parse are skipped.
 */
export async function selectAskedQuestions(
  userId: string,
  lessonSlug: string,
): Promise<string[]> {
  const rows = await db
    .select({ questions: lessonTestResultsTable.questions })
    .from(lessonTestResultsTable)
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        eq(lessonTestResultsTable.lessonSlug, lessonSlug),
      ),
    );
  return rows.flatMap((r) => {
    const parsed = AITestSchema.safeParse(r.questions);
    return parsed.success ? parsed.data.questions.map((q) => q.question) : [];
  });
}
