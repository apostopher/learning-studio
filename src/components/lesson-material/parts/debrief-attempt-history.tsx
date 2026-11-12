import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronDown, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';

export type DebriefAttemptRow = {
  id: number;
  /** When it was completed, already formatted inside `ClientGate`. */
  when: ReactNode;
  /** The attempt's score: chunk mastery for a chunk attempt, 0–100. */
  score: number;
  passed: boolean;
  /** Question text only, as the status route projects it. */
  questions: readonly { id: string; question: string }[];
  /**
   * Each answer's grade. A legacy multiple-choice attempt reaches the client
   * without its options, so no answer is shown for any attempt: question and
   * score, plus the grader's note where a chunk attempt has one.
   */
  evaluations: readonly {
    questionId: string;
    score: number;
    revisitNote?: string;
  }[];
};

type DebriefAttemptHistoryProps = {
  /** In display order — the server sends passing attempts first. */
  attempts: readonly DebriefAttemptRow[];
};

const scoreBadgeClass = (score: number) => {
  if (score >= 80)
    return 'border border-success-7 bg-success-3 text-success-text';
  if (score >= 50)
    return 'border border-warning-7 bg-warning-3 text-warning-text';
  return 'border border-error-7 bg-error-3 text-error-text';
};

/**
 * The Debrief tab once passed: every attempt (date, score, outcome), each
 * expandable to its questions with their scores. History is shown only now,
 * never while a retake is pending.
 *
 * Presentational and hookless.
 */
export const DebriefAttemptHistory = ({
  attempts,
}: DebriefAttemptHistoryProps) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center gap-3 rounded-lg border border-success-7 bg-success-3 px-4 py-3">
      <CircleCheck
        className="size-5 shrink-0 text-success-text"
        aria-hidden="true"
      />
      <div className="flex flex-col">
        <p className="text-sm font-medium text-primary">Debrief passed</p>
        <p className="text-sm text-secondary">
          Every attempt is below. Open one to review its questions.
        </p>
      </div>
    </div>

    <ul className="flex flex-col gap-2">
      {attempts.map((attempt) => (
        <li key={attempt.id}>
          <Collapsible.Root className="group/attempt flex flex-col gap-2">
            <Collapsible.Trigger className="flex w-full items-center gap-3 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5 text-start text-sm hover:bg-gray-2">
              <span className="min-w-0 flex-1 text-primary">
                {attempt.when}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-primary">
                {attempt.score}%
              </span>
              <span
                className={
                  attempt.passed
                    ? 'shrink-0 rounded-full border border-success-7 bg-success-3 px-2 py-0.5 text-xs font-semibold text-success-text'
                    : 'shrink-0 rounded-full border border-gray-7 bg-gray-3 px-2 py-0.5 text-xs font-semibold text-secondary'
                }
              >
                {attempt.passed ? 'Passed' : 'Not yet passed'}
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-tertiary transition-transform duration-200 group-data-[open]/attempt:rotate-180"
                aria-hidden="true"
              />
            </Collapsible.Trigger>
            <Collapsible.Panel className="overflow-hidden data-[ending-hidden]:animate-collapse data-[starting-hidden]:animate-collapse">
              <ol className="flex flex-col gap-2">
                {attempt.questions.map((question, i) => {
                  const evaluation = attempt.evaluations.find(
                    (e) => e.questionId === question.id,
                  );
                  const note = evaluation?.revisitNote?.trim();
                  return (
                    <li
                      key={question.id}
                      className="flex flex-col gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-3 text-sm">
                        <span className="shrink-0 font-medium text-secondary">
                          Q{i + 1}
                        </span>
                        <p className="min-w-0 flex-1 text-primary">
                          {question.question}
                        </p>
                        {evaluation && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreBadgeClass(evaluation.score)}`}
                          >
                            {evaluation.score}/100
                          </span>
                        )}
                      </div>
                      {note ? (
                        <p className="max-w-prose text-sm leading-relaxed text-secondary">
                          {note}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </Collapsible.Panel>
          </Collapsible.Root>
        </li>
      ))}
    </ul>
  </div>
);
