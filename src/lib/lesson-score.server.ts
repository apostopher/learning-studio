import { getLatestLessonQuizAnswers } from '#/db/lesson-quiz';
import {
  selectAuthoredQuiz,
  selectCoursePassMark,
} from '#/db/lesson-score-facts';
import { partitionQuiz } from '#/lib/lesson-quiz';
import type { ScoreFacts } from '#/lib/lesson-score';
import { DEFAULT_PASS_MARK } from '#/lib/pass-mark';

export { debriefJudge, type ScoreFacts, setScore } from '#/lib/lesson-score';

/**
 * How many of the lesson's quiz questions this pilot has right; null = no
 * quiz. Counts the ASKABLE authored questions (`partitionQuiz`: the ones the
 * quiz tab actually asks, duplicate ids once) that the LATEST attempt
 * answered correctly, so a corrected quiz counts; 0 right when never taken.
 * Graded against the authored key, matched by question id: the saved attempt
 * is the request body, so its `correctOptionId`s and its length are the
 * client's word and never trusted. An answer to a question the quiz does not
 * have counts for nothing.
 */
export async function getScoreFacts(
  userId: string,
  lessonSlug: string,
): Promise<ScoreFacts> {
  const questions = partitionQuiz(await selectAuthoredQuiz(lessonSlug)).askable;
  if (questions.length === 0) return { quiz: null };
  const latest = await getLatestLessonQuizAnswers(userId, lessonSlug);
  const picked = new Map(
    (latest?.answers ?? []).map((a) => [a.id, a.userOptionId]),
  );
  const correct = questions.filter((q) => {
    const choice = picked.get(q.id);
    return choice !== undefined && choice === q.correctOptionId;
  }).length;
  return { quiz: { correct, total: questions.length } };
}

/** The course's pass mark; `DEFAULT_PASS_MARK` when there is no course row. */
export async function getCoursePassMark(courseId: number): Promise<number> {
  return (await selectCoursePassMark(courseId)) ?? DEFAULT_PASS_MARK;
}
