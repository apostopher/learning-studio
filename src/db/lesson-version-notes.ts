import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { lessonsTable } from '#/db/schema';

/** The lesson's running version notes; '' when there are none. */
export async function getLessonVersionNotes(lessonId: number): Promise<string> {
  const [row] = await db
    .select({ notes: lessonsTable.versionNotes })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId));
  return row?.notes ?? '';
}

/**
 * Replaces the lesson's version notes. Touches neither `updatedAt` nor
 * `contentUpdatedAt`: the notes are about the lesson, not part of it.
 */
export async function setLessonVersionNotes(
  lessonId: number,
  notes: string,
): Promise<void> {
  await db
    .update(lessonsTable)
    .set({ versionNotes: notes })
    .where(eq(lessonsTable.id, lessonId));
}
