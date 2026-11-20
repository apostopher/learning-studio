import { getLatestLessonQuizAnswers } from '#/db/lesson-quiz';
import {
  selectAuthoredQuiz,
  selectCoursePassMark,
  selectLessonScoreRow,
} from '#/db/lesson-score-facts';
import { watchedMilestones } from '#/lib/course-milestones';
import { partitionQuiz } from '#/lib/lesson-quiz';
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
 *   ASKABLE authored questions (`partitionQuiz`: the ones the quiz tab
 *   actually asks, duplicate ids once) the LATEST attempt answered
 *   correctly, 0 when never taken, null when none is askable. Graded against the authored key, matched by question id: the
 *   saved attempt is the request body, so its `correctOptionId`s and its
 *   length are the client's word and never trusted. An answer to a question
 *   the quiz does not have counts for nothing.
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
  const [authored, latest] = await Promise.all([
    selectAuthoredQuiz(lessonSlug),
    getLatestLessonQuizAnswers(userId, lessonSlug),
  ]);
  const questions = partitionQuiz(authored).askable;
  if (questions.length === 0) return { video, quiz: null };
  const picked = new Map(
    (latest?.answers ?? []).map((a) => [a.id, a.userOptionId]),
  );
  const correct = questions.filter((q) => {
    const choice = picked.get(q.id);
    return choice !== undefined && choice === q.correctOptionId;
  }).length;
  return { video, quiz: correct / questions.length };
}

/** The course's pass mark; `DEFAULT_PASS_MARK` when there is no course row. */
export async function getCoursePassMark(courseId: number): Promise<number> {
  return (await selectCoursePassMark(courseId)) ?? DEFAULT_PASS_MARK;
}
