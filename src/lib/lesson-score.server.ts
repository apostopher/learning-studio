import { getLatestLessonQuizAnswers } from '#/db/lesson-quiz';
import {
  selectCoursePassMark,
  selectLessonScoreRow,
} from '#/db/lesson-score-facts';
import { watchedMilestones } from '#/lib/course-milestones';
import type { ScoreFacts } from '#/lib/lesson-score';
import { DEFAULT_PASS_MARK } from '#/lib/pass-mark';

export { debriefJudge, type ScoreFacts, setScore } from '#/lib/lesson-score';

const WATCHED_TOTAL = watchedMilestones.length;

/**
 * Video and quiz fractions for this pilot and lesson, by the ring's rules;
 * null = the lesson lacks that part.
 *
 * - Video: present when the lesson has a video (provider and ref) AND asks
 *   for it to be watched; the share of watched-milestones hit.
 * - Quiz: present when the authored quiz has a question; the share of the
 *   LATEST attempt's answers that are correct, 0 when never taken.
 */
export async function getScoreFacts(
  userId: string,
  lessonSlug: string,
  lessonId: number,
): Promise<ScoreFacts> {
  const row = await selectLessonScoreRow(userId, lessonId);
  if (!row) return { video: null, quiz: null };

  const hasVideo = row.videoProvider !== null && row.videoRef !== null;
  const video =
    hasVideo && row.needsVideoWatch
      ? Math.min(row.watchedHits, WATCHED_TOTAL) / WATCHED_TOTAL
      : null;

  if (!row.hasQuiz) return { video, quiz: null };
  const latest = await getLatestLessonQuizAnswers(userId, lessonSlug);
  const answers = latest?.answers ?? [];
  const correct = answers.filter(
    (a) => a.userOptionId !== undefined && a.userOptionId === a.correctOptionId,
  ).length;
  return { video, quiz: answers.length === 0 ? 0 : correct / answers.length };
}

/** The course's pass mark; `DEFAULT_PASS_MARK` when there is no course row. */
export async function getCoursePassMark(courseId: number): Promise<number> {
  return (await selectCoursePassMark(courseId)) ?? DEFAULT_PASS_MARK;
}
