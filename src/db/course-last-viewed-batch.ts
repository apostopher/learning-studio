import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { courseLastViewedTable } from '#/db/schema';

/**
 * Every course this user has a last-viewed pointer for, as course id → lesson
 * id.
 *
 * One query for all of them. The per-course getLastViewedLessonId still exists
 * for the single-course route; this exists so building the /app grid does not
 * become N round trips.
 */
export async function getLastViewedLessonIdsByCourse(
  userId: string,
): Promise<Map<number, number>> {
  const rows = await db
    .select({
      courseId: courseLastViewedTable.courseId,
      lessonId: courseLastViewedTable.lessonId,
    })
    .from(courseLastViewedTable)
    .where(eq(courseLastViewedTable.userId, userId));

  const out = new Map<number, number>();
  for (const row of rows) {
    // lessonId is nullable via `on delete set null` — a pointer to a deleted
    // lesson is the same as no pointer at all.
    if (row.lessonId != null) out.set(row.courseId, row.lessonId);
  }
  return out;
}
