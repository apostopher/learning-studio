import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import { preparedDebriefsTable } from './schema';

/** One pilot's prepared debrief for one lesson in one course. */
export type PreparedDebriefKey = {
  userId: string;
  courseId: number;
  lessonSlug: string;
};

const matches = (k: PreparedDebriefKey) =>
  and(
    eq(preparedDebriefsTable.userId, k.userId),
    eq(preparedDebriefsTable.courseId, k.courseId),
    eq(preparedDebriefsTable.lessonSlug, k.lessonSlug),
  );

/** The fingerprint of the source the stored test was built from, or null when none is stored. */
export async function selectPreparedFingerprint(
  k: PreparedDebriefKey,
): Promise<string | null> {
  const [row] = await db
    .select({ sourceFingerprint: preparedDebriefsTable.sourceFingerprint })
    .from(preparedDebriefsTable)
    .where(matches(k))
    .limit(1);
  return row?.sourceFingerprint ?? null;
}

/**
 * Store (or replace) the prepared test. One row per (user, course, lesson) —
 * the table's unique index is the conflict target — so a regeneration after a
 * source change overwrites the stale test instead of sitting beside it.
 */
export async function upsertPreparedDebrief(
  k: PreparedDebriefKey,
  test: unknown,
  sourceFingerprint: string,
): Promise<void> {
  await db
    .insert(preparedDebriefsTable)
    .values({ ...k, test, sourceFingerprint })
    .onConflictDoUpdate({
      target: [
        preparedDebriefsTable.userId,
        preparedDebriefsTable.courseId,
        preparedDebriefsTable.lessonSlug,
      ],
      set: { test, sourceFingerprint, createdAt: new Date() },
    });
}

/**
 * Remove the prepared test and return what it held, in one statement, so two
 * concurrent claims cannot both be served the same questions.
 */
export async function deletePreparedDebrief(
  k: PreparedDebriefKey,
): Promise<{ test: unknown; sourceFingerprint: string } | null> {
  const [row] = await db
    .delete(preparedDebriefsTable)
    .where(matches(k))
    .returning({
      test: preparedDebriefsTable.test,
      sourceFingerprint: preparedDebriefsTable.sourceFingerprint,
    });
  return row ?? null;
}
