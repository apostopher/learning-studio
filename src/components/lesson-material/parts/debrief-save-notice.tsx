import { Loader2, RotateCcw } from 'lucide-react';

type DebriefSaveNoticeProps = {
  state: 'saving' | 'failed';
  onRetry: () => void;
};

/**
 * Under the score report while its attempt is being saved, or after the save
 * failed. A failed save must not look like a finished attempt: it does not
 * count, so the notice says so and offers the same save again.
 *
 * Presentational and hookless.
 */
export const DebriefSaveNotice = ({
  state,
  onRetry,
}: DebriefSaveNoticeProps) =>
  state === 'saving' ? (
    // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
    <p
      role="status"
      className="inline-flex items-center gap-2 text-sm text-secondary"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Saving your answers…
    </p>
  ) : (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-error-7 bg-error-3 px-4 py-3"
    >
      <p className="text-sm text-error-text">
        Your answers weren&rsquo;t saved, so this attempt doesn&rsquo;t count
        yet. Check your connection, then try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-md border border-gray-6 bg-gray-1 px-4 py-2 text-sm font-medium text-primary hover:bg-gray-3"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Try saving again
      </button>
    </div>
  );
