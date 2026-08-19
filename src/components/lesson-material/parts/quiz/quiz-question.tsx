import { ArrowRight } from 'lucide-react';
import { optionLetter, quizOptionState } from '#/lib/lesson-quiz';
import { READ_ONLY_CONTROL_REASON } from '#/lib/read-only-lesson-copy';
import type { CourseLessonQuizQuestion } from '#/types';
import { QuizOption } from './quiz-option';

const REASON_ID = 'quiz-question-readonly-reason';

type QuizQuestionProps = {
  question: CourseLessonQuizQuestion;
  index: number;
  total: number;
  /** Undefined until the student answers; final once set. */
  chosenOptionId: string | undefined;
  revealed: boolean;
  onSelect: (optionId: string) => void;
  onNext: () => void;
  reducedMotion: boolean;
  /**
   * Completed at an earlier level. The attempt cannot be saved, so it must not
   * be startable either — an answerable quiz whose submit silently refuses is
   * worse than one that says up front it is closed.
   */
  readOnly: boolean;
};

/**
 * A single question slide.
 *
 * The Next control appears only while a *wrong* answer is being held: a correct
 * answer auto-advances, so offering a button there would be a control that
 * vanishes under the pointer. A wrong answer waits for an explicit tap, because
 * the correct option is the only feedback this quiz has — the authored schema
 * carries no explanation text — and yanking it away on a timer is exactly when
 * a student needs to read it.
 */
export const QuizQuestion = ({
  question,
  index,
  total,
  chosenOptionId,
  revealed,
  onSelect,
  onNext,
  reducedMotion,
  readOnly,
}: QuizQuestionProps) => {
  const isLast = index === total - 1;
  const answeredWrong =
    revealed &&
    chosenOptionId !== undefined &&
    chosenOptionId !== question.correctOptionId;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="material-prose text-sm font-medium leading-relaxed text-primary"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: quiz prose is stored as sanitized HTML upstream, same as key points
        dangerouslySetInnerHTML={{ __html: question.question }}
      />

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
              chosenOptionId,
              revealed,
            })}
            // No handler in read-only, which makes QuizOption render each row
            // as static content rather than a dozen dead buttons — the same
            // treatment review mode already gets.
            onSelect={
              revealed || readOnly ? undefined : () => onSelect(option.id)
            }
          />
        ))}
      </ul>

      {/* Visible, not sr-only — same reasoning as QuizResult's Retake reason.
          A control that is simply absent leaves the pilot wondering whether
          the quiz is broken. */}
      {readOnly && (
        <p id={REASON_ID} className="text-xs text-tertiary">
          {READ_ONLY_CONTROL_REASON}
        </p>
      )}

      {answeredWrong && (
        <button
          type="button"
          // Inert handler, not just aria-disabled: aria-disabled does not block
          // the click the way native `disabled` did, so the component itself
          // must refuse to act.
          onClick={() => {
            if (!readOnly) onNext();
          }}
          aria-disabled={readOnly || undefined}
          aria-describedby={readOnly ? REASON_ID : undefined}
          className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10 aria-disabled:pointer-events-none aria-disabled:opacity-60"
        >
          {isLast ? 'See results' : 'Next question'}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
