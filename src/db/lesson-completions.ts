import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseModulesTable,
  lessonCompletionsTable,
  moduleLessonsTable,
} from '#/db/schema';

/**
 * Stamp lessons as done. Insert-only by design: `done_at` starts the 24h
 * debrief clock and must never move, so a lesson that later drops below 100%
 * keeps its original row, and a repeat insert is a no-op.
 */
export async function recordLessonCompletions(
  userId: string,
  lessonIds: readonly number[],
): Promise<void> {
  if (lessonIds.length === 0) return;
  await db
    .insert(lessonCompletionsTable)
    .values(lessonIds.map((lessonId) => ({ userId, lessonId })))
    .onConflictDoNothing();
}

/** Ids of the course's lessons this pilot has a completion row for. */
export async function getDoneLessonIds(
  userId: string,
  courseId: number,
): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ lessonId: lessonCompletionsTable.lessonId })
    .from(lessonCompletionsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonCompletionsTable.lessonId),
    )
    .innerJoin(
      courseModulesTable,
      eq(courseModulesTable.moduleId, moduleLessonsTable.moduleId),
    )
    .where(
      and(
        eq(lessonCompletionsTable.userId, userId),
        eq(courseModulesTable.courseId, courseId),
      ),
    );
  return new Set(rows.map((r) => r.lessonId));
}
