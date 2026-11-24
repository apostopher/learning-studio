import { eq, max, sql } from 'drizzle-orm';
import type { PgInsertValue } from 'drizzle-orm/pg-core';
import { db } from '#/db';
import {
  debriefChunkMasteryTable,
  type LessonKnowledgeChunksSelect,
  lessonKnowledgeChunksTable,
  lessonsTable,
} from './schema';

/** `db` or a transaction handle, so callers can group writes atomically. */
export type Executor = Pick<typeof db, 'select' | 'insert' | 'delete'>;

/** The stored chunk list of a snapshot, or null when none is stored yet. */
export async function selectLessonChunks(
  lessonVersionId: number,
  ex: Executor = db,
): Promise<LessonKnowledgeChunksSelect | null> {
  const [row] = await ex
    .select()
    .from(lessonKnowledgeChunksTable)
    .where(eq(lessonKnowledgeChunksTable.lessonVersionId, lessonVersionId))
    .limit(1);
  return row ?? null;
}

/**
 * The number for the lesson's next chunk list: one past the highest of ANY of
 * its rows, whichever snapshot each is of, so that a chunk id (`v3-c1`) names
 * one key point of one snapshot.
 *
 * Locks the lesson until `ex`'s transaction ends, so store the list in that
 * transaction. `no key update`, not `update`: recording an answer holds the
 * chunk row this will wait for and takes a key share on the lesson, so the
 * stronger lock would deadlock the two.
 */
export async function nextChunkVersion(
  lessonId: number,
  ex: Executor = db,
): Promise<number> {
  await ex
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .for('no key update');
  const [row] = await ex
    .select({ version: max(lessonKnowledgeChunksTable.version) })
    .from(lessonKnowledgeChunksTable)
    .where(eq(lessonKnowledgeChunksTable.lessonId, lessonId));
  return (row?.version ?? 0) + 1;
}

/** Store (or replace) the snapshot's one chunk row; `lessonVersionId` is the conflict target. */
export async function upsertLessonChunks(
  row: Pick<
    LessonKnowledgeChunksSelect,
    'lessonId' | 'version' | 'sourceFingerprint' | 'chunks' | 'previousMapping'
  > & { lessonVersionId: number },
  ex: Executor = db,
): Promise<void> {
  await ex
    .insert(lessonKnowledgeChunksTable)
    .values(row)
    .onConflictDoUpdate({
      target: lessonKnowledgeChunksTable.lessonVersionId,
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
 * Unpassed pilots' mastery rows of the one list being replaced. Rows of the new
 * list (concurrent pilots) and of the lesson's other snapshots are not it.
 */
export const staleMasteryRows = (lessonId: number, previousVersion: number) =>
  sql`${unpassedMasteryRows(lessonId)} and ${debriefChunkMasteryTable.chunkId} like ${`v${previousVersion}-%`}`;

export const selectStaleMastery = (
  ex: Executor,
  lessonId: number,
  previousVersion: number,
) =>
  ex
    .select()
    .from(debriefChunkMasteryTable)
    .where(staleMasteryRows(lessonId, previousVersion));

export const deleteStaleMastery = (
  ex: Executor,
  lessonId: number,
  previousVersion: number,
) =>
  ex
    .delete(debriefChunkMasteryTable)
    .where(staleMasteryRows(lessonId, previousVersion));

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
