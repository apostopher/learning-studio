import { Loader2 } from 'lucide-react';

/**
 * The material form's submit, rendered OUTSIDE the form — in the modal's
 * sidebar footer — and wired to it by `form={formId}`. Full width: the
 * sidebar is narrow, and a primary action pinned in a column reads as a
 * bar, not a chip.
 */
export const MaterialSaveButton = ({
  formId,
  isSaving,
}: {
  formId: string;
  isSaving: boolean;
}) => (
  <button
    type="submit"
    form={formId}
    disabled={isSaving}
    aria-label={isSaving ? 'Saving material…' : 'Save material'}
    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-apple-9 px-4 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
  >
    {isSaving && (
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    )}
    Save material
  </button>
);
