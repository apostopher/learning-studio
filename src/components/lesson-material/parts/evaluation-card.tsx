import { ArrowRight, Check, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { AIEvaluationResult, AITestQuestion } from '#/ai/schemas';

type EvaluationCardProps = {
  question: AITestQuestion;
  evaluation: AIEvaluationResult;
  index: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
};

const scoreBadgeClass = (score: number) => {
  if (score >= 80) return 'border border-green-7 bg-green-3 text-success-text';
  if (score >= 50) return 'border border-amber-7 bg-amber-3 text-warning-text';
  return 'border border-red-7 bg-red-3 text-error-text';
};

export const EvaluationCard = ({
  question,
  evaluation,
  index,
  total,
  isLast,
  onNext,
}: EvaluationCardProps) => {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-secondary">
          {index + 1} of {total}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${scoreBadgeClass(evaluation.score)}`}
        >
          {evaluation.score}/100
        </span>
      </div>

      {/* Question text */}
      <p className="text-base font-medium text-primary">{question.question}</p>

      {/* MCQ result */}
      {question.type === 'mcq' && (
        <ol className="flex flex-col gap-2">
          {question.options.map((option) => {
            const isCorrect = option.id === question.correctOptionId;
            const isUserPick = option.id === evaluation.userAnswer;
            const isWrongPick = isUserPick && !isCorrect;

            let optionClass = 'border border-gray-6 bg-gray-1 text-gray-9';
            let Icon: React.ElementType | null = null;

            if (isCorrect) {
              optionClass =
                'border border-green-7 bg-green-3 text-success-text';
              Icon = Check;
            } else if (isWrongPick) {
              optionClass = 'border border-red-7 bg-red-3 text-error-text';
              Icon = X;
            }

            return (
              <li
                key={option.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${optionClass}`}
              >
                {Icon ? (
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <span className="size-4 shrink-0" aria-hidden="true" />
                )}
                {option.value}
              </li>
            );
          })}
        </ol>
      )}

      {/* Free-text result */}
      {question.type === 'free-text' && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-tertiary">
            Your answer
          </span>
          <div className="rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5 text-sm text-primary">
            {evaluation.userAnswer || (
              <span className="italic text-gray-9">No answer provided</span>
            )}
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-tertiary">
          Explanation
        </span>
        <div className="rounded-lg border border-gray-6 bg-gray-2 px-3 py-2.5 text-sm leading-relaxed text-primary">
          {evaluation.explanation}
        </div>
      </div>

      {/* CTA button */}
      <div className="flex">
        <button
          type="button"
          onClick={onNext}
          className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10"
        >
          {isLast ? 'See Results' : 'Next'}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
};
