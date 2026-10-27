import { Clock, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import { DEBRIEF_PAR_SCORE } from '#/lib/debrief-schedule';
import { describeOutstanding } from '#/lib/lock-copy';

type DebriefWaitProps = {
  /** Unique per panel (`useId` in the container) — the aria ids hang off it. */
  idBase: string;
  /** 2 under the tab strip, 3 inside the material-less "Debrief" section. */
  headingLevel: 2 | 3;
} & (
  | { kind: 'not-done'; outstanding: readonly OutstandingItem[] }
  /**
   * `time` is the formatted opening time inside `ClientGate`, so it is
   * absent on the server and the first client render. The heading never
   * depends on it.
   */
  | { kind: 'waiting'; time: ReactNode }
  | { kind: 'retake-waiting'; time: ReactNode }
);

/**
 * The Debrief tab while the debrief is closed. Every variant states why it is
 * closed and what opens it, visibly AND as the panel's accessible name (the
 * heading: the reason) and description (the body: the time, or what is left
 * to do) — a closed tab with no explanation is the failure the spec rules
 * out.
 *
 * retake-waiting shows ONLY the reopen time: no score and no history until
 * the debrief is passed (the spec's states table).
 *
 * Presentational and hookless.
 */
export const DebriefWait = (props: DebriefWaitProps) => {
  const Heading = props.headingLevel === 2 ? 'h2' : 'h3';
  const headingId = `${props.idBase}-heading`;
  const bodyId = `${props.idBase}-body`;

  const heading =
    props.kind === 'not-done'
      ? 'Debrief locked until you finish this lesson'
      : props.kind === 'waiting'
        ? 'Debrief opens 24 hours after you finished this lesson'
        : 'Next attempt opens 24 hours after your last one';

  const todo =
    props.kind === 'not-done' ? describeOutstanding(props.outstanding) : '';

  return (
    // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
    <div
      role="status"
      aria-labelledby={headingId}
      aria-describedby={bodyId}
      className="flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 px-6 py-10 text-center"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-gray-a3 text-secondary">
        {props.kind === 'not-done' ? (
          <Lock className="size-5" aria-hidden="true" />
        ) : (
          <Clock className="size-5" aria-hidden="true" />
        )}
      </span>

      <Heading id={headingId} className="text-base font-medium text-primary">
        {heading}
      </Heading>

      <div
        id={bodyId}
        className="flex max-w-prose flex-col gap-1 text-sm text-secondary"
      >
        {props.kind === 'not-done' ? (
          <p>
            {todo
              ? `Opens 24 hours after you finish this lesson — ${todo}.`
              : 'Opens 24 hours after you finish this lesson.'}
          </p>
        ) : props.kind === 'waiting' ? (
          <>
            <p className="font-medium text-primary">Opens {props.time}.</p>
            <p>
              The wait means it tests what you remember rather than what you
              just watched.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-primary">
              Next attempt opens {props.time}.
            </p>
            <p>
              Your last attempt was below {DEBRIEF_PAR_SCORE}. You&rsquo;ll get
              a fresh set of questions.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
