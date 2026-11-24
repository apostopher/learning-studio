import { eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import {
  countCoursesOnVersion,
  highestTakenVersions,
  type Tx,
} from '#/db/lesson-versions';
import { lessonsTable } from '#/db/schema';
import type { VersionConflictBody } from '#/lib/admin-schemas';
import {
  formatVersion,
  lockedVersionMessage,
  versionEditError,
} from '#/lib/lesson-version';

/** A content edit refused by the lesson's version; `body` is the 409's. */
export class VersionEditError extends Error {
  constructor(readonly body: VersionConflictBody) {
    super(body.error);
    this.name = 'VersionEditError';
  }
}

/**
 * Lock the working copy, then decide. The lock is the one a course takes
 * before freezing a version, so one taking it between two saves is seen:
 * everything here is read after the lock is held.
 */
async function lockEditable(
  tx: Tx,
  lessonId: number,
  version: string | undefined,
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
  if (!lesson) return null;

  const taken = await highestTakenVersions([lessonId], tx);
  const state = {
    version: lesson.version,
    highestTaken: taken.get(lessonId) ?? null,
  };
  const refusal = versionEditError(state, version);
  if (refusal) {
    throw new VersionEditError({
      error:
        refusal.reason === 'locked'
          ? lockedVersionMessage(
              lesson.version,
              await countCoursesOnVersion(lessonId, lesson.version, tx),
            )
          : `Enter a version higher than ${formatVersion(refusal.than)}.`,
      code: 'version',
      ...state,
    });
  }
  return lesson;
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
 * Throws `VersionEditError` when a course has taken the current version and
 * `version` is not a higher one. Null when there is no such lesson.
 */
export async function applyContentEdit(
  tx: Tx,
  lessonId: number,
  version: string | undefined,
): Promise<{ id: number; slug: string } | null> {
  const lesson = await lockEditable(tx, lessonId, version);
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
    const lesson = await lockEditable(tx, lessonId, version);
    if (!lesson) return null;
    if (lesson.version !== version) await markEdited(tx, lessonId, version);
    return { id: lesson.id, version };
  });
}
