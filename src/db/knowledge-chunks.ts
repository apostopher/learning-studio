import { eq, sql } from 'drizzle-orm';
import type { PgInsertValue } from 'drizzle-orm/pg-core';
import { db } from '#/db';
import {
  debriefChunkMasteryTable,
  type LessonKnowledgeChunksSelect,
  lessonKnowledgeChunksTable,
} from './schema';

/** `db` or a transaction handle, so callers can group writes atomically. */
export type Executor = Pick<typeof db, 'select' | 'insert' | 'delete'>;

/** The stored chunk list for a lesson, or null when none is stored yet. */
export async function selectLessonChunks(
  lessonId: number,
): Promise<LessonKnowledgeChunksSelect | null> {
  const [row] = await db
    .select()
    .from(lessonKnowledgeChunksTable)
    .where(eq(lessonKnowledgeChunksTable.lessonId, lessonId))
    .limit(1);
  return row ?? null;
}

/** Store (or replace) the lesson's one chunk row; `lessonId` is the conflict target. */
export async function upsertLessonChunks(
  row: Pick<
    LessonKnowledgeChunksSelect,
    'lessonId' | 'version' | 'sourceFingerprint' | 'chunks' | 'previousMapping'
  >,
  ex: Executor = db,
): Promise<void> {
  await ex
    .insert(lessonKnowledgeChunksTable)
    .values(row)
    .onConflictDoUpdate({
      target: lessonKnowledgeChunksTable.lessonId,
      set: {
        version: row.version,
        sourceFingerprint: row.sourceFingerprint,
        chunks: row.chunks,
        previousMapping: row.previousMapping,
        createdAt: new Date(),
      },
    });
}

/**
 * Mastery rows of one lesson that belong to pilots WITHOUT a permanent pass.
 * A pass is stored by lesson slug, so it is joined through `lessons`. Outer
 * columns are table-qualified: a bare column in a single-table select binds
 * to the wrong table inside the raw subquery.
 */
export const unpassedMasteryRows = (lessonId: number) =>
  sql`${debriefChunkMasteryTable.lessonId} = ${lessonId} and not exists (select 1 from debrief_passes dp inner join lessons l on l.slug = dp.lesson_slug where dp.user_id = ${debriefChunkMasteryTable.userId} and l.id = ${lessonId})`;

/**
 * Unpassed pilots' mastery rows whose chunk id is NOT at `version`. Rows
 * already written under the new version by concurrent pilots are excluded, so
 * carry-over never touches them and a re-run is safe.
 */
export const staleMasteryRows = (lessonId: number, version: number) =>
  sql`${unpassedMasteryRows(lessonId)} and ${debriefChunkMasteryTable.chunkId} not like ${`v${version}-%`}`;

export const selectStaleMastery = (
  ex: Executor,
  lessonId: number,
  version: number,
) =>
  ex
    .select()
    .from(debriefChunkMasteryTable)
    .where(staleMasteryRows(lessonId, version));

export const deleteStaleMastery = (
  ex: Executor,
  lessonId: number,
  version: number,
) =>
  ex
    .delete(debriefChunkMasteryTable)
    .where(staleMasteryRows(lessonId, version));

/** Insert carried rows; on a collision with an existing row keep it but make it cleared (cleared stays cleared). */
export const insertCarriedMastery = (
  ex: Executor,
  rows: PgInsertValue<typeof debriefChunkMasteryTable>[],
) =>
  ex
    .insert(debriefChunkMasteryTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        debriefChunkMasteryTable.userId,
        debriefChunkMasteryTable.lessonId,
        debriefChunkMasteryTable.chunkId,
      ],
      set: {
        clearedAt: sql`coalesce(${debriefChunkMasteryTable.clearedAt}, excluded.cleared_at)`,
      },
    });
