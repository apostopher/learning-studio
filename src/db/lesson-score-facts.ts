import { eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import { hasQuizSql } from '#/db/progress-components';
import { coursesTable, lessonsTable } from '#/db/schema';
import { watchedMilestones } from '#/lib/course-milestones';

/**
 * What decides a lesson's video and quiz parts for one pilot, by the ring's
 * definitions (`getCourseProgress`): the video columns, whether the authored
 * quiz has a question (`hasQuizSql`), and the distinct watched-milestones
 * (10..95) this pilot has hit. Null when the lesson does not exist.
 */
export async function selectLessonScoreRow(
  userId: string,
  lessonId: number,
): Promise<{
  videoProvider: string | null;
  videoRef: string | null;
  needsVideoWatch: boolean;
  hasQuiz: boolean;
  watchedHits: number;
} | null> {
  const [row] = await db
    .select({
      videoProvider: lessonsTable.videoProvider,
      videoRef: lessonsTable.videoRef,
      needsVideoWatch: lessonsTable.needsVideoWatch,
      hasQuiz: hasQuizSql(lessonsTable.slug),
      // `lessonId` as a parameter, not the outer column: a bare outer column
      // inside a single-table select binds to the subquery's own table.
      watchedHits: sql<number>`(
        select count(distinct v.progress)::int from videos_progress v
        where v.user_id = ${userId}
          and v.lesson_id = ${lessonId}
          and v.progress in (${sql.raw(watchedMilestones.join(', '))})
      )`,
    })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);
  return row ? { ...row, watchedHits: Number(row.watchedHits) } : null;
}

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
