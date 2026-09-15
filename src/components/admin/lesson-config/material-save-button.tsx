import { Loader2 } from 'lucide-react';
import { cn } from '#/lib/cn';

/**
 * The material form's submit, rendered OUTSIDE the form — in the modal's
 * sidebar footer or the header — and wired to it by `form={formId}`.
 * `fullWidth` in a sidebar: the column is narrow, and a primary action
 * pinned in it reads as a bar, not a chip.
 */
export const MaterialSaveButton = ({
  formId,
  isSaving,
  fullWidth = false,
}: {
  formId: string;
  isSaving: boolean;
  /** Stretch to the column — for a sidebar footer; a header keeps its own width. */
  fullWidth?: boolean;
}) => (
  <button
    type="submit"
    form={formId}
    disabled={isSaving}
    aria-label={isSaving ? 'Saving material…' : 'Save material'}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-md bg-apple-9 px-4 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60',
      fullWidth && 'w-full',
    )}
  >
    {isSaving && (
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    )}
    Save material
  </button>
);
