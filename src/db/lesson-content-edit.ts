import { eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import type { Tx } from '#/db/lesson-versions';
import { lessonsTable } from '#/db/schema';

/**
 * Lock the working copy. The lock is the one a course takes before freezing
 * it, so a course never freezes half of a write.
 */
async function lockWorkingCopy(
  tx: Tx,
  lessonId: number,
): Promise<{ id: number; slug: string; version: string } | null> {
  const [lesson] = await tx
    .select({
      id: lessonsTable.id,
      slug: lessonsTable.slug,
      version: lessonsTable.version,
    })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .for('update');
  return lesson ?? null;
}

async function markEdited(
  tx: Tx,
  lessonId: number,
  version: string,
): Promise<void> {
  await tx
    .update(lessonsTable)
    .set({ version, contentUpdatedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(lessonsTable.id, lessonId));
}

/**
 * Call first inside the transaction of every write to a lesson's versioned
 * content: what `lesson_versions` freezes. Locks the lesson row, so the write
 * that follows, and any read it makes, is settled too.
 *
 * `version` is the label the edit moves the lesson to, any at all; undefined
 * keeps the one it has. It never refuses: courses hold their own copies, and
 * whether to flag the edit with a new label is the author's call. Null when
 * there is no such lesson.
 */
export async function applyContentEdit(
  tx: Tx,
  lessonId: number,
  version: string | undefined,
): Promise<{ id: number; slug: string } | null> {
  const lesson = await lockWorkingCopy(tx, lessonId);
  if (!lesson) return null;
  await markEdited(tx, lessonId, version ?? lesson.version);
  return { id: lesson.id, slug: lesson.slug };
}

/** Change the version alone. The version it already has is not an edit. */
export async function setLessonVersion(
  lessonId: number,
  version: string,
): Promise<{ id: number; version: string } | null> {
  return db.transaction(async (tx) => {
    const lesson = await lockWorkingCopy(tx, lessonId);
    if (!lesson) return null;
    if (lesson.version !== version) await markEdited(tx, lessonId, version);
    return { id: lesson.id, version };
  });
}
