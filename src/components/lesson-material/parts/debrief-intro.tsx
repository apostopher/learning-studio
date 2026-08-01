import { Loader2, NotebookPen } from 'lucide-react';

type DebriefIntroProps = {
  loading: boolean;
  onStart: () => void;
};

/**
 * The Debrief tab before a debrief has been generated.
 *
 * This tab used to render nothing at all when no test was in memory, which was
 * survivable while the post-video overlay was the only way in — dismiss it or
 * reload and the debrief was simply gone. Now that the tab is the primary
 * entry point (and the only one on a lesson with no video), it needs a state
 * that says what it is and how to start it.
 */
export const DebriefIntro = ({ loading, onStart }: DebriefIntroProps) => (
  <div className="flex flex-col items-start gap-3 py-2">
    <p className="text-secondary text-sm">
      A short set of questions on this lesson, generated from its key points.
      Your answers are scored and saved.
    </p>
    <button
      type="button"
      onClick={onStart}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10 disabled:opacity-60"
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
  </div>
);
