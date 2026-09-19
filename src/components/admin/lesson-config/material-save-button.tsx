import { Loader2 } from 'lucide-react';
import { cn } from '#/lib/cn';

const label = (isSaving: boolean, isDirty: boolean) => {
  if (isSaving) return 'Saving material…';
  if (isDirty) return 'Save material — unsaved changes';
  return 'Save material';
};

/**
 * The material form's submit, rendered OUTSIDE the form — in the modal's
 * sidebar footer or the header — and wired to it by `form={formId}`.
 * `fullWidth` in a sidebar: the column is narrow, and a primary action
 * pinned in it reads as a bar, not a chip.
 *
 * `isDirty` is the "you have edits, press me" cue. It goes accent (gold)
 * rather than the resting navy, and — because colour alone is no cue
 * (WCAG 1.4.1) — grows a dot before the label and says so in its accessible
 * name. Saving wins over dirty: mid-flight there is nothing left to press.
 */
export const MaterialSaveButton = ({
  formId,
  isSaving,
  isDirty = false,
  fullWidth = false,
}: {
  formId: string;
  isSaving: boolean;
  /** The form has edits that are not yet saved. */
  isDirty?: boolean;
  /** Stretch to the column — for a sidebar footer; a header keeps its own width. */
  fullWidth?: boolean;
}) => {
  const showDirty = isDirty && !isSaving;
  return (
    <button
      type="submit"
      form={formId}
      disabled={isSaving}
      aria-label={label(isSaving, isDirty)}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60',
        showDirty
          ? 'bg-accent-9 text-accent-contrast hover:bg-accent-10 focus-visible:ring-accent-9'
          : 'bg-apple-9 text-apple-contrast hover:bg-apple-10 focus-visible:ring-apple-9',
        fullWidth && 'w-full',
      )}
    >
      {isSaving && (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      )}
      {showDirty && (
        <span
          className="block h-2 w-2 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      Save material
    </button>
  );
};
