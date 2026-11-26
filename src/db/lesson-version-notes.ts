import { and, eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import { lessonVersionNotesTable } from '#/db/schema';

/** The notes written for one version of a lesson; '' when there are none. */
export async function getLessonVersionNotes(
  lessonId: number,
  version: string,
): Promise<string> {
  const [row] = await db
    .select({ notes: lessonVersionNotesTable.notes })
    .from(lessonVersionNotesTable)
    .where(
      and(
        eq(lessonVersionNotesTable.lessonId, lessonId),
        eq(lessonVersionNotesTable.version, version),
      ),
    );
  return row?.notes ?? '';
}

/**
 * Writes the notes for one version, replacing any already there. Cleared
 * notes delete the row rather than keep an empty one.
 */
export async function setLessonVersionNotes(
  lessonId: number,
  version: string,
  notes: string,
): Promise<void> {
  if (notes.trim() === '') {
    await db
      .delete(lessonVersionNotesTable)
      .where(
        and(
          eq(lessonVersionNotesTable.lessonId, lessonId),
          eq(lessonVersionNotesTable.version, version),
        ),
      );
    return;
  }
  await db
    .insert(lessonVersionNotesTable)
    .values({ lessonId, version, notes })
    .onConflictDoUpdate({
      target: [
        lessonVersionNotesTable.lessonId,
        lessonVersionNotesTable.version,
      ],
      set: { notes, updatedAt: sql`now()` },
    });
}
