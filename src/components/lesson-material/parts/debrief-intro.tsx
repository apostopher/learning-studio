import { Loader2, NotebookPen } from 'lucide-react';
import { READ_ONLY_CONTROL_REASON } from '#/lib/read-only-lesson-copy';

type DebriefIntroProps = {
  loading: boolean;
  onStart: () => void;
  /** Completed at an earlier level — Start must be disabled, not silently inert. */
  readOnly: boolean;
  /** A later attempt: fresh questions on the chunks not yet cleared. */
  retake: boolean;
  /**
   * Some current chunk is cleared, so a retake mixes one or two back in as
   * review. False for a pilot with nothing cleared (only legacy attempts, or
   * a first chunk attempt that cleared nothing): the copy must not promise it.
   */
  clearedSome: boolean;
};

const REASON_ID = 'debrief-intro-readonly-reason';

// No per-answer number: mastery is the only debrief number (R15).
const HOW_IT_WORKS =
  'Show you have got every chunk and the debrief is done. Your answer saves as you type, so you can come back and finish later.';

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
  clearedSome,
}: DebriefIntroProps) => (
  <div className="flex flex-col items-start gap-3 py-2">
    <p className="text-secondary text-sm">
      {retake
        ? clearedSome
          ? 'Fresh questions on the knowledge chunks you have not shown yet, plus one or two you have, answered in your own words. '
          : 'Fresh questions on the knowledge chunks you have not shown yet, answered in your own words. '
        : 'Each question checks one knowledge chunk of this lesson, answered in your own words. '}
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
