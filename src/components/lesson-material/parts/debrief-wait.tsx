import { Clock, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import { DEBRIEF_PAR_SCORE } from '#/lib/debrief-schedule';
import { describeOutstanding } from '#/lib/lock-copy';

type DebriefWaitProps =
  | { kind: 'not-done'; outstanding: readonly OutstandingItem[] }
  /** `time` is the formatted opening time, already inside `ClientGate`. */
  | { kind: 'waiting'; time: ReactNode }
  | { kind: 'retake-waiting'; time: ReactNode };

/**
 * The Debrief tab while the debrief is closed. Every variant states why it is
 * closed and what opens it, visibly — a closed tab with no explanation is the
 * failure the spec rules out.
 *
 * retake-waiting shows ONLY the reopen time: no score and no history until
 * the debrief is passed (the spec's states table).
 *
 * Presentational and hookless: the times arrive as nodes because formatting
 * them needs the browser's timezone, which the container renders inside
 * `ClientGate`.
 */
export const DebriefWait = (props: DebriefWaitProps) => {
  const todo =
    props.kind === 'not-done' ? describeOutstanding(props.outstanding) : '';

  return (
    // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 px-6 py-10 text-center"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-gray-a3 text-secondary">
        {props.kind === 'not-done' ? (
          <Lock className="size-5" aria-hidden="true" />
        ) : (
          <Clock className="size-5" aria-hidden="true" />
        )}
      </span>

      {props.kind === 'not-done' ? (
        <>
          <p className="text-base font-medium text-primary">Debrief locked</p>
          <p className="max-w-prose text-sm text-secondary">
            {todo
              ? `Opens 24 hours after you finish this lesson — ${todo}.`
              : 'Opens 24 hours after you finish this lesson.'}
          </p>
        </>
      ) : props.kind === 'waiting' ? (
        <>
          <p className="text-base font-medium text-primary">
            Opens {props.time}
          </p>
          <p className="max-w-prose text-sm text-secondary">
            Your debrief opens 24 hours after you finished this lesson, so it
            tests what you remember rather than what you just watched.
          </p>
        </>
      ) : (
        <>
          <p className="text-base font-medium text-primary">
            Next attempt opens {props.time}
          </p>
          <p className="max-w-prose text-sm text-secondary">
            Your last attempt was below {DEBRIEF_PAR_SCORE}. You&rsquo;ll get a
            fresh set of questions.
          </p>
        </>
      )}
    </div>
  );
};
