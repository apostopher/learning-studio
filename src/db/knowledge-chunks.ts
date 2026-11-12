import { eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import {
  debriefChunkMasteryTable,
  type LessonKnowledgeChunksSelect,
  lessonKnowledgeChunksTable,
} from './schema';

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
): Promise<void> {
  await db
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

/** The stored list, or the given version of it (only the current one is kept). */
export async function getLessonChunks(
  lessonId: number,
  version?: number,
): Promise<LessonKnowledgeChunksSelect | null> {
  const row = await selectLessonChunks(lessonId);
  if (!row || (version !== undefined && row.version !== version)) return null;
  return row;
}
