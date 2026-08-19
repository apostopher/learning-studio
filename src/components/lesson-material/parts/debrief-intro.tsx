import { Loader2, NotebookPen } from 'lucide-react';
import { READ_ONLY_CONTROL_REASON } from '#/lib/read-only-lesson-copy';

type DebriefIntroProps = {
  loading: boolean;
  onStart: () => void;
  /** Completed at an earlier level — Start must be disabled, not silently inert. */
  readOnly: boolean;
};

const REASON_ID = 'debrief-intro-readonly-reason';

/**
 * The Debrief tab before a debrief has been generated.
 *
 * This tab used to render nothing at all when no test was in memory, which was
 * survivable while the post-video overlay was the only way in — dismiss it or
 * reload and the debrief was simply gone. Now that the tab is the primary
 * entry point (and the only one on a lesson with no video), it needs a state
 * that says what it is and how to start it.
 */
export const DebriefIntro = ({
  loading,
  onStart,
  readOnly,
}: DebriefIntroProps) => (
  <div className="flex flex-col items-start gap-3 py-2">
    {/*
      No longer "generated from its key points": on a lesson with no material
      the questions come from the video's own transcript, and copy that names
      one source would be wrong half the time.
    */}
    <p className="text-secondary text-sm">
      A short set of questions on this lesson. Your answers are scored and
      saved.
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
