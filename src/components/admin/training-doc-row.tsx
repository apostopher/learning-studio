import { Popover } from '@base-ui/react/popover';
import { FileText, Loader2, Trash2 } from 'lucide-react';

interface TrainingDocRowProps {
  sourcePath: string;
  count: number;
  onDelete: () => void;
  isDeleting: boolean;
}

/**
 * One training-document row. HOOKLESS — the confirm-before-delete uses a Base UI
 * `Popover` (its state lives inside the library), so this component calls no
 * React hook and is safe to render in a test. See the plan's hookless constraint.
 */
export const TrainingDocRow = ({
  sourcePath,
  count,
  onDelete,
  isDeleting,
}: TrainingDocRowProps) => (
  <div className="flex items-center gap-3 rounded-lg border border-gray-6 bg-gray-1 px-4 py-3">
    <FileText className="h-5 w-5 shrink-0 text-tertiary" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium text-primary">{sourcePath}</p>
      <p className="text-tertiary text-sm">{count} embeddings</p>
    </div>

    <Popover.Root>
      <Popover.Trigger
        aria-label={`Delete ${sourcePath}`}
        className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-error-9/15 hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-50">
          <Popover.Popup className="w-64 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg">
            <p className="text-secondary text-sm">
              Delete this document and its {count} embeddings?
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Popover.Close className="rounded-md px-2 py-1 text-secondary text-xs hover:text-primary">
                Cancel
              </Popover.Close>
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1 rounded-md bg-error px-2 py-1 font-medium text-on-error text-xs disabled:opacity-60"
              >
                {isDeleting ? (
                  <Loader2
                    className="h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                Confirm
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  </div>
);
