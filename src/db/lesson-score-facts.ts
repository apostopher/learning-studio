import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { getPinnedSnapshot } from '#/db/course-lesson-content';
import { coursesTable } from '#/db/schema';
import type { CourseLessonQuiz } from '#/types';

/** The course's debrief pass mark; null when there is no such course. */
export async function selectCoursePassMark(
  courseId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ passMark: coursesTable.passMark })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  return row?.passMark ?? null;
}

/**
 * The authored quiz of the lesson as this course has it: the grading key for
 * a pilot's answers. Null when it asks nothing.
 */
export async function selectAuthoredQuiz(
  lessonSlug: string,
  courseId: number,
): Promise<CourseLessonQuiz | null> {
  const quiz = (await getPinnedSnapshot(lessonSlug, courseId))?.quiz;
  return quiz?.length ? quiz : null;
}
