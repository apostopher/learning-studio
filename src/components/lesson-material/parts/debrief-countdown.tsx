import type { ReactNode } from 'react';

type DebriefCountdownProps = {
  /** `formatCountdown` of the time left: "5 h 40 min". Ticks. */
  countdown: string;
  /**
   * The exact opening time, formatted inside `ClientGate` (null on the
   * server and the first client render; the line is left out until then).
   */
  clockTime: ReactNode;
  /**
   * The sentence screen readers hear: set by the container once when the
   * countdown starts, so the region fills after it mounts and is announced
   * once, never on a tick.
   */
  announcement: string;
  /** 2 under the tab strip, 3 inside the material-less "Debrief" section. */
  headingLevel: 2 | 3;
  /** Lets a containing panel take the heading as its accessible name. */
  headingId?: string;
};

/**
 * "Your next debrief opens in 5 h 40 min", with the clock time under it.
 *
 * The heading ticks, so it is `aria-live="off"`: a containing live region
 * must not read it out every minute (every second, near the end). What
 * screen readers hear is the visually hidden status sentence instead.
 *
 * Presentational and hookless.
 */
export const DebriefCountdown = ({
  countdown,
  clockTime,
  announcement,
  headingLevel,
  headingId,
}: DebriefCountdownProps) => {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Heading
        id={headingId}
        aria-live="off"
        className="text-base font-medium text-primary tabular-nums"
      >
        Your next debrief opens in {countdown}
      </Heading>
      {clockTime ? (
        <p className="text-sm text-secondary">Opens {clockTime}.</p>
      ) : null}
      {/* biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};
