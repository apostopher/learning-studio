import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '#/db';
import { lessonsTable, lessonTestResultsTable } from '#/db/schema';
import { type LessonGaps, recentLessonGaps } from '#/lib/debrief-gaps';

/** How many lessons' gaps Viper is told about: the most recent ones. */
const LESSONS_IN_PROMPT = 5;
/** Attempts read to find them — several per lesson is normal. */
const ATTEMPTS_READ = 60;

/**
 * This learner's current debrief gaps, for Viper: what their latest debrief
 * on each of their most recent lessons showed they have not yet got (see
 * `recentLessonGaps`). Learner-scoped, not course-scoped: the gaps are the
 * learner's, and they took each debrief inside a course they could reach.
 */
export async function findRecentDebriefGaps(
  userId: string,
): Promise<LessonGaps[]> {
  const rows = await db
    .select({
      lessonSlug: lessonTestResultsTable.lessonSlug,
      lessonName: lessonsTable.name,
      answers: lessonTestResultsTable.answers,
    })
    .from(lessonTestResultsTable)
    .innerJoin(
      lessonsTable,
      eq(lessonsTable.slug, lessonTestResultsTable.lessonSlug),
    )
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        isNotNull(lessonTestResultsTable.completedAt),
      ),
    )
    .orderBy(desc(lessonTestResultsTable.completedAt))
    .limit(ATTEMPTS_READ);
  return recentLessonGaps(rows, LESSONS_IN_PROMPT);
}
