import type { SetJudge } from '#/lib/debrief-sets';

/**
 * A lesson's score, from the stakeholder's RGS doc (2026-11-20, confirmed by
 * the user 2026-11-24): the debrief set's average (0..100) plus 5 points for
 * each quiz question answered right. The video is not part of it. Pure and
 * client-safe.
 *
 * Not capped: a 90 average and 5 right answers is 115, and the sum shown to
 * the pilot has to add up.
 *
 * A course's pass mark is set for a lesson with a full quiz of five. A lesson
 * with fewer questions cannot earn those points, so its mark drops by them
 * (`lessonPassMark`): marked 85, three questions need 75 and no quiz needs 60.
 */

export const POINTS_PER_QUIZ_ANSWER = 5;
/** A quiz has up to this many questions. */
export const FULL_QUIZ_QUESTIONS = 5;

export type ScorePartName = 'quiz' | 'debrief';

export type ScorePart = {
  part: ScorePartName;
  /** The most this part can bring. */
  weight: number;
  /** 0..1 of it earned. */
  fraction: number;
  points: number;
};

export type LessonScore = {
  total: number;
  /** What this lesson needs: the course's mark less its missing quiz points. */
  passMark: number;
  passed: boolean;
  parts: ScorePart[];
};

/** One decimal ("85.5"); whole numbers without ".0" ("50"). */
export function formatScore(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** What a debrief set does not change: the quiz. Null = the lesson has none. */
export type ScoreFacts = { quiz: { correct: number; total: number } | null };

/** The course's pass mark, less 5 for each question the quiz is short of five. */
export function lessonPassMark(
  { quiz }: ScoreFacts,
  coursePassMark: number,
): number {
  const missing = Math.max(0, FULL_QUIZ_QUESTIONS - (quiz?.total ?? 0));
  return Math.max(0, coursePassMark - missing * POINTS_PER_QUIZ_ANSWER);
}

/**
 * The lesson score with `average` (0..100) as the debrief part. The debrief
 * always counts here, whether or not the lesson's debrief switch is on: this
 * is the score a set is judged on. With no quiz it is the average alone.
 * `coursePassMark` is the course's; the result carries the lesson's own.
 */
export function setScore(
  facts: ScoreFacts,
  coursePassMark: number,
  average: number,
): LessonScore {
  const { quiz } = facts;
  const parts: ScorePart[] = [];
  if (quiz !== null) {
    parts.push({
      part: 'quiz',
      weight: quiz.total * POINTS_PER_QUIZ_ANSWER,
      fraction: quiz.total === 0 ? 0 : quiz.correct / quiz.total,
      points: quiz.correct * POINTS_PER_QUIZ_ANSWER,
    });
  }
  parts.push({
    part: 'debrief',
    weight: 100,
    fraction: average / 100,
    points: average,
  });
  const passMark = lessonPassMark(facts, coursePassMark);
  const total = parts.reduce((a, p) => a + p.points, 0);
  return { total, passMark, passed: total >= passMark, parts };
}

/** A set passes when its (best-so-far) average lifts the score to the pass mark. */
export function debriefJudge(
  facts: ScoreFacts,
  coursePassMark: number,
): SetJudge {
  return (average) => setScore(facts, coursePassMark, average).passed;
}
