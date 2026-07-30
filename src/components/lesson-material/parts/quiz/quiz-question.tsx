import { ArrowRight } from 'lucide-react';
import { optionLetter, quizOptionState } from '#/lib/lesson-quiz';
import type { CourseLessonQuizQuestion } from '#/types';
import { QuizOption } from './quiz-option';

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
            onSelect={revealed ? undefined : () => onSelect(option.id)}
          />
        ))}
      </ul>

      {answeredWrong && (
        <button
          type="button"
          onClick={onNext}
          className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10"
        >
          {isLast ? 'See results' : 'Next question'}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
