import { Loader2, TriangleAlert } from 'lucide-react';

interface NewsSourceDeleteConfirmProps {
  sourceName: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Delete confirmation for one news source.
 *
 * Deliberately lighter than `DeleteConfirmForm`'s typed "permanently delete"
 * gate. That gate exists for courses and modules, where deleting destroys
 * authored content and learner progress. A news source is a name, a URL and a
 * logo, belongs to exactly one course, and is a minute's work to recreate —
 * making the admin type a phrase to remove one is friction without a matching
 * consequence. The warning still names what is being deleted and says the
 * action cannot be undone.
 */
export const NewsSourceDeleteConfirm = ({
  sourceName,
  isPending,
  onConfirm,
  onCancel,
}: NewsSourceDeleteConfirmProps) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-start gap-2 rounded-lg border border-warning-7 bg-warning-3 px-3 py-2.5 text-sm text-warning-text">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>{sourceName}</strong> will be removed from this course&rsquo;s
        news feed. Sources are not shared between courses, so no other course is
        affected. This cannot be undone.
      </p>
    </div>

    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={isPending}
        className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7 disabled:opacity-60"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={isPending}
        // text-black, not the generated contrast token: white on error-9
        // measures below AA in dark mode.
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-error-9 px-4 py-2.5 font-medium text-black text-sm transition-colors hover:bg-error-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        Delete news source
      </button>
    </div>
  </div>
);
