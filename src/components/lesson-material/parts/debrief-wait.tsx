import { Clock, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import {
  DEBRIEF_DELAY_LABEL,
  DEBRIEF_RETAKE_DELAY_MS,
  formatDebriefDelay,
} from '#/lib/debrief-schedule';
import { describeOutstanding } from '#/lib/lock-copy';
import { DebriefCountdown } from './debrief-countdown';

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
  /** The 6 h after a finished attempt: a live countdown (`DebriefCountdown`). */
  | {
      kind: 'retake-waiting';
      countdown: string;
      time: ReactNode;
      announcement: string;
    }
);

/** Why a retake is closed. Shared with the just-finished report. */
export const RETAKE_WAIT_REASON = `Each attempt opens ${formatDebriefDelay(DEBRIEF_RETAKE_DELAY_MS / 60_000)} after your last attempt finished, with fresh questions on what you have not cleared yet.`;

/**
 * The Debrief tab while the debrief is closed. Every variant states why it is
 * closed and what opens it, visibly AND as the panel's accessible name (the
 * heading) and description (the body) — a closed tab with no explanation is
 * the failure the spec rules out.
 *
 * retake-waiting shows the countdown and the reason only: no score and no
 * history until the debrief is passed. Its panel is a plain region, not a
 * status: the countdown carries its own once-only announcement, and a live
 * region around a ticking heading would read it out on every tick.
 *
 * Presentational and hookless.
 */
export const DebriefWait = (props: DebriefWaitProps) => {
  const Heading = props.headingLevel === 2 ? 'h2' : 'h3';
  const headingId = `${props.idBase}-heading`;
  const bodyId = `${props.idBase}-body`;
  const panelClass =
    'flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 px-6 py-10 text-center';
  const icon = (
    <span className="flex size-10 items-center justify-center rounded-full bg-gray-a3 text-secondary">
      {props.kind === 'not-done' ? (
        <Lock className="size-5" aria-hidden="true" />
      ) : (
        <Clock className="size-5" aria-hidden="true" />
      )}
    </span>
  );

  if (props.kind === 'retake-waiting') {
    return (
      <section
        aria-labelledby={headingId}
        aria-describedby={bodyId}
        className={panelClass}
      >
        {icon}
        <DebriefCountdown
          countdown={props.countdown}
          clockTime={props.time}
          announcement={props.announcement}
          headingLevel={props.headingLevel}
          headingId={headingId}
        />
        <p id={bodyId} className="max-w-prose text-sm text-secondary">
          {RETAKE_WAIT_REASON}
        </p>
      </section>
    );
  }

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
      : 'We will debrief this KC tomorrow.';

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
      className={panelClass}
    >
      {icon}

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
        ) : (
          <>
            <p className="font-medium text-primary">
              Today, just review the quiz, key points, pro tips and assignments.
            </p>
            {/* "Tomorrow" is the tester's wording, but a morning watch opens
                the same evening, so the exact time stays underneath. It is
                client-only, so absent on the server render. */}
            {props.time ? <p>Opens {props.time}.</p> : null}
          </>
        )}
      </div>
    </div>
  );
};
