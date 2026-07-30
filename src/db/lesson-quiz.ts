import { and, desc, eq } from 'drizzle-orm';
import { db } from '#/db';
import type { CourseLessonQuizAnswers } from '#/types';
import { lessonQuizAnswersTable } from './schema';

/**
 * Attempts at a lesson's authored quiz.
 *
 * Insert-only: retakes are unlimited and every attempt is kept. The table has
 * no unique constraint on (user, lesson), so an upsert would need a migration —
 * and the history is worth having. `getLatestLessonQuizAnswers` is therefore
 * the only supported way to read "the student's result": the previous
 * implementation of this feature selected without an ORDER BY and returned
 * `rows[0]`, which meant every retake was written and then never displayed.
 */

export async function saveLessonQuizAnswers(data: {
  userId: string;
  lessonSlug: string;
  answers: CourseLessonQuizAnswers;
}) {
  const [row] = await db
    .insert(lessonQuizAnswersTable)
    .values({
      userId: data.userId,
      lessonSlug: data.lessonSlug,
      answers: data.answers,
    })
    .returning();

  return row;
}

/** The student's most recent attempt at this lesson's quiz, or null. */
export async function getLatestLessonQuizAnswers(
  userId: string,
  lessonSlug: string,
) {
  const rows = await db
    .select()
    .from(lessonQuizAnswersTable)
    .where(
      and(
        eq(lessonQuizAnswersTable.userId, userId),
        eq(lessonQuizAnswersTable.lessonSlug, lessonSlug),
      ),
    )
    // `id` breaks ties: two attempts can land in the same millisecond (a
    // double-submit that slips the client-side guard), and without it which
    // row wins would be arbitrary.
    .orderBy(
      desc(lessonQuizAnswersTable.createdAt),
      desc(lessonQuizAnswersTable.id),
    )
    .limit(1);

  return rows[0] ?? null;
}
