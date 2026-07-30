import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import {
  optionLetter,
  type QuizScore,
  quizGradeLabel,
  quizOptionState,
  scoreQuizAnswers,
} from '#/lib/lesson-quiz';
import type { CourseLessonQuizAnswers } from '#/types';
import { QuizOption } from './quiz-option';

/** Whether the attempt made it to the server. */
export type QuizSaveState = 'idle' | 'saving' | 'error' | 'saved';

type QuizResultProps = {
  answers: CourseLessonQuizAnswers;
  saveState: QuizSaveState;
  onRetrySave: () => void;
  onRetake: () => void;
  reducedMotion: boolean;
};

const scoreToneClass = ({ correct, total }: QuizScore) => {
  if (total > 0 && correct === total) {
    return 'border-success-7 bg-success-3 text-success-text';
  }
  if (correct >= total * 0.7) {
    return 'border-gray-6 bg-gray-2 text-primary';
  }
  return 'border-warning-7 bg-warning-3 text-warning-text';
};

/**
 * The last slide: the score, then every question reviewed.
 *
 * Rendered entirely from the answers snapshot rather than from today's
 * `material.quiz`. Admins edit quizzes live, so reviewing against the current
 * version would mark a student wrong for an answer that was right when they
 * gave it, or highlight an option they never saw.
 */
export const QuizResult = ({
  answers,
  saveState,
  onRetrySave,
  onRetake,
  reducedMotion,
}: QuizResultProps) => {
  const score = scoreQuizAnswers(answers);

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`flex flex-col items-center gap-3 rounded-xl border px-6 py-8 text-center ${scoreToneClass(score)}`}
      >
        <p className="text-3xl font-semibold tabular-nums">
          {score.correct}/{score.total}
        </p>
        <p className="text-sm font-medium">{quizGradeLabel(score)}</p>

        <button
          type="button"
          onClick={onRetake}
          className="inline-flex items-center gap-2 rounded-md border border-gray-6 bg-gray-1 px-4 py-2 text-sm font-medium text-primary hover:bg-gray-3"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Retake quiz
        </button>
      </div>

      {/* Never silently swallow a failed save: without this the student walks
          away believing the attempt was recorded and returns to an empty quiz. */}
      {saveState === 'error' && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-7 bg-warning-3 px-4 py-3 text-sm text-warning-text"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Couldn&rsquo;t save your result. Your answers are still here.
          </span>
          <button
            type="button"
            onClick={onRetrySave}
            className="rounded-md border border-warning-7 px-3 py-1.5 font-medium hover:bg-warning-4"
          >
            Retry
          </button>
        </div>
      )}

      {saveState === 'saving' && (
        <p className="flex items-center gap-2 text-xs text-tertiary">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Saving your result…
        </p>
      )}

      <div className="flex flex-col gap-4">
        <h3 className="text-base font-semibold text-primary">Review</h3>

        <ol className="flex flex-col gap-5">
          {answers.map((question, questionIndex) => (
            <li key={question.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-inverted px-1.5 text-[11px] font-semibold tabular-nums text-gray-1"
                >
                  {questionIndex + 1}
                </span>
                <div
                  className="material-prose min-w-0 flex-1 text-sm font-medium leading-relaxed text-primary"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: quiz prose is stored as sanitized HTML upstream, same as key points
                  dangerouslySetInnerHTML={{ __html: question.question }}
                />
              </div>

              <ul className="flex flex-col gap-2">
                {question.options.map((option, optionIndex) => (
                  <QuizOption
                    key={option.id}
                    letter={optionLetter(optionIndex)}
                    html={option.value}
                    reducedMotion={reducedMotion}
                    state={quizOptionState({
                      optionId: option.id,
                      correctOptionId: question.correctOptionId,
                      chosenOptionId: question.userOptionId,
                      revealed: true,
                    })}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};
