import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import { coursesTable, lessonMaterialTable } from '#/db/schema';
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
 * The lesson's authored quiz: the grading key for a pilot's answers. The
 * first material row (by id) whose quiz has a question, the same rows
 * `hasQuizSql` counts (`lesson_material.lesson_slug` is not unique). Null
 * when there is none.
 */
export async function selectAuthoredQuiz(
  lessonSlug: string,
): Promise<CourseLessonQuiz | null> {
  const [row] = await db
    .select({ quiz: lessonMaterialTable.quiz })
    .from(lessonMaterialTable)
    .where(
      and(
        eq(lessonMaterialTable.lessonSlug, lessonSlug),
        sql`json_array_length(${lessonMaterialTable.quiz}) > 0`,
      ),
    )
    .orderBy(asc(lessonMaterialTable.id))
    .limit(1);
  return row?.quiz ?? null;
}
