import { Loader2, NotebookPen } from 'lucide-react';
import { CHUNK_CLEAR_SCORE } from '#/lib/debrief-mastery';
import { READ_ONLY_CONTROL_REASON } from '#/lib/read-only-lesson-copy';

type DebriefIntroProps = {
  loading: boolean;
  onStart: () => void;
  /** Completed at an earlier level — Start must be disabled, not silently inert. */
  readOnly: boolean;
  /** A later attempt: fresh questions on the chunks not yet cleared. */
  retake: boolean;
};

const REASON_ID = 'debrief-intro-readonly-reason';

const HOW_IT_WORKS = `Score ${CHUNK_CLEAR_SCORE} or more on a chunk to clear it; clear them all to pass. Your answer saves as you type, so you can come back and finish later.`;

/**
 * The Debrief tab once the debrief is open, before it has been generated.
 * The tab is the only way in, so it says what the debrief is, what passes it,
 * and how to start it.
 */
export const DebriefIntro = ({
  loading,
  onStart,
  readOnly,
  retake,
}: DebriefIntroProps) => (
  <div className="flex flex-col items-start gap-3 py-2">
    <p className="text-secondary text-sm">
      {retake
        ? 'Fresh questions on the knowledge chunks you have not cleared yet, plus one or two you have, answered in your own words. '
        : 'One question for each knowledge chunk in this lesson, answered in your own words. '}
      {HOW_IT_WORKS}
    </p>
    <button
      type="button"
      // Inert handler, not just aria-disabled: aria-disabled does not
      // block the click event the way native `disabled` did, so the
      // component itself — not just every caller — must refuse to act.
      onClick={() => {
        if (!readOnly) onStart();
      }}
      disabled={loading}
      aria-disabled={readOnly || undefined}
      aria-describedby={readOnly ? REASON_ID : undefined}
      className="inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10 disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60"
    >
      <span aria-hidden="true" className="inline-flex">
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <NotebookPen size={16} />
        )}
      </span>
      {loading ? 'Preparing debrief…' : 'Start debrief'}
    </button>
    {/* Visible, not sr-only: a locked control states its reason where anyone
        can read it, not only where a screen reader can. */}
    {readOnly && (
      <p id={REASON_ID} className="text-xs text-tertiary">
        {READ_ONLY_CONTROL_REASON}
      </p>
    )}
  </div>
);
