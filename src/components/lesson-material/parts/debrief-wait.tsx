import { Clock, Lock, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import { DEBRIEF_DELAY_LABEL, DEBRIEF_PAR_SCORE } from '#/lib/debrief-schedule';
import { describeOutstanding } from '#/lib/lock-copy';

/** What reopens a below-par debrief on a video lesson. Shared with the just-failed report. */
export const REWATCH_COPY = `Your last debrief came in under ${DEBRIEF_PAR_SCORE}. Watch this knowledge chunk again to the end, and a fresh debrief opens straight away.`;

type DebriefWaitProps = {
  /** Unique per panel (`useId` in the container) — the aria ids hang off it. */
  idBase: string;
  /** 2 under the tab strip, 3 inside the material-less "Debrief" section. */
  headingLevel: 2 | 3;
} & (
  | {
      kind: 'not-done';
      outstanding: readonly OutstandingItem[];
      /** Names the closing tab in the to-do list (`sectionLabel`). */
      courseSlug: string;
    }
  /**
   * `time` is the formatted opening time inside `ClientGate`, so it is
   * absent on the server and the first client render. The heading never
   * depends on it.
   */
  | { kind: 'waiting'; time: ReactNode }
  | { kind: 'retake-waiting'; time: ReactNode }
  /** Below par on a video lesson: the redo opens once the video is rewatched. */
  | { kind: 'rewatch' }
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

  // On a video lesson only the video starts the clock, so the route reports
  // just that; anywhere else the clock starts when the lesson is done.
  const videoOnly =
    props.kind === 'not-done' &&
    props.outstanding.length === 1 &&
    props.outstanding[0]?.kind === 'video';

  const heading =
    props.kind === 'not-done'
      ? videoOnly
        ? 'Debrief locked until you watch the video'
        : 'Debrief locked until you finish this lesson'
      : props.kind === 'waiting'
        ? 'We will debrief this KC tomorrow.'
        : props.kind === 'rewatch'
          ? 'Rewatch the video to redo this debrief'
          : `Next attempt opens ${DEBRIEF_DELAY_LABEL} after your last one`;

  const todo =
    props.kind === 'not-done'
      ? describeOutstanding(props.outstanding, props.courseSlug)
      : '';

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
        ) : props.kind === 'rewatch' ? (
          <RotateCcw className="size-5" aria-hidden="true" />
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
            {videoOnly
              ? `Opens ${DEBRIEF_DELAY_LABEL} after you finish watching the video.`
              : todo
                ? `Opens ${DEBRIEF_DELAY_LABEL} after you finish this lesson — ${todo}.`
                : `Opens ${DEBRIEF_DELAY_LABEL} after you finish this lesson.`}
          </p>
        ) : props.kind === 'rewatch' ? (
          <p>{REWATCH_COPY}</p>
        ) : props.kind === 'waiting' ? (
          <>
            <p className="font-medium text-primary">
              Today, just review the quiz, key points, pro tips and assignments.
            </p>
            {/* "Tomorrow" is the tester's wording, but a morning watch opens
                the same evening, so the exact time stays underneath. It is
                client-only, so absent on the server render. */}
            {props.time ? <p>Opens {props.time}.</p> : null}
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
