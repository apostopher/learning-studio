import { Loader2, TriangleAlert } from 'lucide-react';

/**
 * Delete confirmation for one discipline module.
 *
 * Light on purpose, like `NewsSourceDeleteConfirm`: deleting the module does
 * not delete its lessons — they return to the discipline's Untitled group —
 * so this asks nothing more than a plain "are you sure", stated as what
 * actually happens rather than a generic warning.
 */
export const DeleteDisciplineModuleConfirm = ({
  moduleName,
  lessonCount,
  isPending,
  onConfirm,
  onCancel,
}: {
  moduleName: string;
  lessonCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-start gap-2 rounded-lg border border-warning-7 bg-warning-3 px-3 py-2.5 text-sm text-warning-text">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>
          {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'} in{' '}
          {moduleName} {lessonCount === 1 ? 'returns' : 'return'} to Untitled.
        </strong>{' '}
        Nothing is deleted — only the box goes.
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
        // measures below AA in dark mode — see `NewsSourceDeleteConfirm`.
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-error-9 px-4 py-2.5 font-medium text-black text-sm transition-colors hover:bg-error-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        Delete module
      </button>
    </div>
  </div>
);
