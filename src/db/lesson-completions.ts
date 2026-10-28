import { db } from '#/db';
import { lessonCompletionsTable } from '#/db/schema';

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
