import { Button } from '@base-ui/react/button';
import { Loader2 } from 'lucide-react';
import type { Ref } from 'react';
import { DEBRIEF_OFFER_NO, DEBRIEF_OFFER_YES } from '#/lib/debrief-copy';
import type { LessonScore } from '#/lib/lesson-score';
import {
  DEBRIEF_PRIMARY_BUTTON,
  DEBRIEF_SECONDARY_BUTTON,
} from './debrief-buttons';
import { DebriefScoreBreakdown } from './debrief-score-breakdown';

type DebriefOfferProps = {
  /** `passOfferCopy(n)`: the doc's offer, naming set 2's question count. */
  copy: string;
  /** The lesson total set 1 passed on. */
  score: LessonScore | null;
  quizTaken: boolean;
  /** The choice being sent, if one is: both buttons wait for it. */
  pending: 'yes' | 'no' | null;
  /** Why the last choice failed (`continueErrorCopy`); '' when it did not. */
  error: string;
  onYes: () => void;
  onNo: () => void;
  /** 2 under the tab strip, 3 inside the material-less "Debrief" section. */
  headingLevel: 2 | 3;
  idBase: string;
  /** Focused on mount, so the offer is read before anything else. */
  headingRef?: Ref<HTMLHeadingElement>;
};

/**
 * Set 1 passed and set 2 is on offer: the total set 1 reached, the doc's
 * offer, and Yes / No. Pressing either again after a failure retries it.
 *
 * Presentational: the container sends the choice.
 */
export const DebriefOffer = ({
  copy,
  score,
  quizTaken,
  pending,
  error,
  onYes,
  onNo,
  headingLevel,
  idBase,
  headingRef,
}: DebriefOfferProps) => {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const headingId = `${idBase}-offer-heading`;
  const busy = pending !== null;
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      className="flex flex-col gap-4 rounded-xl border border-gray-6 bg-gray-2 p-5"
    >
      <Heading
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-semibold text-primary outline-none"
      >
        Set 1 passed
      </Heading>
      {score && <DebriefScoreBreakdown score={score} quizTaken={quizTaken} />}
      <p className="max-w-prose text-sm leading-relaxed text-primary">{copy}</p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={onYes}
          disabled={busy}
          className={DEBRIEF_PRIMARY_BUTTON}
        >
          {pending === 'yes' && (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          )}
          {DEBRIEF_OFFER_YES}
        </Button>
        <Button
          type="button"
          onClick={onNo}
          disabled={busy}
          className={DEBRIEF_SECONDARY_BUTTON}
        >
          {pending === 'no' && (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          )}
          {DEBRIEF_OFFER_NO}
        </Button>
      </div>
      {/* Mounted empty, so a failure is announced when it lands. */}
      <p role="alert" className="text-sm text-error-text empty:hidden">
        {error}
      </p>
    </section>
  );
};
