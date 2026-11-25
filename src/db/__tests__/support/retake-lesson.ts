import { and, eq } from 'drizzle-orm';
import { courseLessonVersionsTable } from '#/db/schema';
import type { TestDb } from './local-pg';

/**
 * One course takes the lesson's working copy again, as when it is removed and
 * added back, but without touching the placement: other courses showing the
 * same module keep their pins, so a test can compare them.
 */
export async function retakeLesson(
  db: TestDb,
  courseId: number,
  lessonId: number,
): Promise<{ createdVersionIds: number[] }> {
  // Here, so that it meets the test file's mocks.
  const { syncCourseLessonVersions } = await import('#/db/lesson-versions');
  return db.transaction(async (tx) => {
    await tx
      .delete(courseLessonVersionsTable)
      .where(
        and(
          eq(courseLessonVersionsTable.courseId, courseId),
          eq(courseLessonVersionsTable.lessonId, lessonId),
        ),
      );
    return syncCourseLessonVersions(tx, [courseId]);
  });
}
