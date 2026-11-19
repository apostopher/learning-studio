import { Button } from '@base-ui/react/button';
import {
  DEBRIEF_RETAKE_LATER,
  DEBRIEF_RETAKE_NOW,
  DEBRIEF_TWO_MISSED_COPY,
} from '#/lib/debrief-copy';
import {
  DEBRIEF_PRIMARY_BUTTON,
  DEBRIEF_SECONDARY_BUTTON,
} from './debrief-buttons';

type DebriefRetakePromptProps = {
  /** Start a fresh attempt now (the retake is open at once). */
  onRetakeNow: () => void;
  /** Close this prompt; the report stays, and the retake waits. */
  onLater: () => void;
};

/**
 * Both sets missed: what to do next, in the doc's words, then Retake now or
 * Later. Sits under the score report's summary.
 *
 * Presentational and hookless.
 */
export const DebriefRetakePrompt = ({
  onRetakeNow,
  onLater,
}: DebriefRetakePromptProps) => (
  <div className="flex flex-col items-center gap-3">
    <p className="text-sm leading-relaxed text-primary">
      {DEBRIEF_TWO_MISSED_COPY}
    </p>
    <div className="flex flex-wrap justify-center gap-3">
      <Button
        type="button"
        onClick={onRetakeNow}
        className={DEBRIEF_PRIMARY_BUTTON}
      >
        {DEBRIEF_RETAKE_NOW}
      </Button>
      <Button
        type="button"
        onClick={onLater}
        className={DEBRIEF_SECONDARY_BUTTON}
      >
        {DEBRIEF_RETAKE_LATER}
      </Button>
    </div>
  </div>
);
