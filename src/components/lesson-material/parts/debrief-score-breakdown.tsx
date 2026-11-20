import {
  formatScore,
  type LessonScore,
  type ScorePartName,
} from '#/lib/lesson-score';

type DebriefScoreBreakdownProps = {
  /** The lesson total a set was judged on (`setResult.score`). */
  score: LessonScore;
  /**
   * The pilot has a quiz result for this lesson. A quiz part at 0 that was
   * never taken says what taking it is worth; one taken and scored 0 does not.
   */
  quizTaken: boolean;
};

const LABEL: Record<ScorePartName, string> = {
  video: 'Video',
  quiz: 'Quiz',
  debrief: 'Debrief',
};

/**
 * The total as shown: a miss is floored to one decimal, so a total just
 * under the mark (84.96) never reads as the mark itself ("85").
 */
function shownTotal(score: LessonScore): number {
  return score.passed ? score.total : Math.floor(score.total * 10) / 10;
}

/** "Video 50 + Quiz 20 + Debrief 12.9 = 82.9 · pass mark 85". */
export function scoreBreakdownLine(score: LessonScore): string {
  const sum = score.parts
    .map((p) => `${LABEL[p.part]} ${formatScore(p.points)}`)
    .join(' + ');
  return `${sum} = ${formatScore(shownTotal(score))} · pass mark ${score.passMark}`;
}

/**
 * How a set's lesson total adds up: each part's points, the total and the
 * course's pass mark, so the pilot sees why a set passed or missed.
 *
 * Presentational and hookless.
 */
export const DebriefScoreBreakdown = ({
  score,
  quizTaken,
}: DebriefScoreBreakdownProps) => {
  const quiz = score.parts.find((p) => p.part === 'quiz');
  const quizHint =
    quiz !== undefined && quiz.fraction === 0 && !quizTaken
      ? `Quiz not taken yet — taking it adds up to ${formatScore(quiz.weight)} points.`
      : null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-primary tabular-nums">
        {scoreBreakdownLine(score)}
      </p>
      {quizHint && <p className="text-sm text-secondary">{quizHint}</p>}
    </div>
  );
};
