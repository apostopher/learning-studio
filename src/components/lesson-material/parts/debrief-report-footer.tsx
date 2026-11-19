import { Button } from '@base-ui/react/button';
import { DEBRIEF_DECLINE_COPY, DEBRIEF_RETAKE_NOW } from '#/lib/debrief-copy';
import type { FinishedDebrief } from '../compute-debrief-panel';
import { DEBRIEF_PRIMARY_BUTTON } from './debrief-buttons';
import { DebriefRetakePrompt } from './debrief-retake-prompt';

type DebriefReportFooterProps = {
  /** The report's attempt passed (`result.passed`). */
  passed: boolean;
  note: FinishedDebrief['note'];
  /** Start a fresh attempt now (the retake is open at once). */
  onRetakeNow: () => void;
  /** Close the two-misses prompt; the report stays. */
  onLater: () => void;
};

/**
 * What sits under the score report's summary:
 * - a declined offer: the decline note;
 * - two misses: the prompt with Retake now / Later;
 * - after Later, an unpassed report keeps Retake now alone, so the retake
 *   is never more than one press away;
 * - a pass: nothing.
 *
 * Presentational: the container starts the attempt.
 */
export const DebriefReportFooter = ({
  passed,
  note,
  onRetakeNow,
  onLater,
}: DebriefReportFooterProps) => {
  if (note === 'declined') {
    return <p className="text-sm text-primary">{DEBRIEF_DECLINE_COPY}</p>;
  }
  if (note === 'retake') {
    return <DebriefRetakePrompt onRetakeNow={onRetakeNow} onLater={onLater} />;
  }
  if (passed) return null;
  return (
    <Button
      type="button"
      onClick={onRetakeNow}
      className={DEBRIEF_PRIMARY_BUTTON}
    >
      {DEBRIEF_RETAKE_NOW}
    </Button>
  );
};
