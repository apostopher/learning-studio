import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronDown, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AIEvaluationResult, AITestQuestion } from '#/ai/schemas';
import { ScoreReport } from './score-report';

export type DebriefAttemptRow = {
  id: number;
  /** When it was completed, already formatted inside `ClientGate`. */
  when: ReactNode;
  score: number;
  passed: boolean;
  questions: AITestQuestion[];
  evaluations: AIEvaluationResult[];
};

type DebriefAttemptHistoryProps = {
  /** In display order — the server sends passing attempts first. */
  attempts: readonly DebriefAttemptRow[];
};

/**
 * The Debrief tab once passed: every attempt (date, score, Passed / Below
 * par), each expandable to its own score report (call 3). History is shown
 * only now, never while a retake is pending.
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
          <Collapsible.Root className="group flex flex-col gap-4">
            <Collapsible.Trigger className="flex w-full items-center gap-3 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5 text-start text-sm hover:bg-gray-2">
              <span className="min-w-0 flex-1 text-primary">
                {attempt.when}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-primary">
                {attempt.score}/100
              </span>
              <span
                className={
                  attempt.passed
                    ? 'shrink-0 rounded-full border border-success-7 bg-success-3 px-2 py-0.5 text-xs font-semibold text-success-text'
                    : 'shrink-0 rounded-full border border-error-7 bg-error-3 px-2 py-0.5 text-xs font-semibold text-error-text'
                }
              >
                {attempt.passed ? 'Passed' : 'Below par'}
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-tertiary transition-transform duration-200 group-data-[open]:rotate-180"
                aria-hidden="true"
              />
            </Collapsible.Trigger>
            <Collapsible.Panel className="overflow-hidden data-[ending-hidden]:animate-collapse data-[starting-hidden]:animate-collapse">
              <ScoreReport
                score={attempt.score}
                questions={attempt.questions}
                evaluations={attempt.evaluations}
              />
            </Collapsible.Panel>
          </Collapsible.Root>
        </li>
      ))}
    </ul>
  </div>
);
