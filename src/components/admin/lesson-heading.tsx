import { Check, Eye, EyeOff, Loader2, Pencil } from 'lucide-react';
import type { FormEventHandler } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { cn } from '#/lib/cn';
import { TooltipIconButton } from '../ui/tooltip-icon-button';

/**
 * The lesson dialog's heading: the name, a pencil to rename it in place, and
 * — at the far end — one icon button for whether learners can see it.
 *
 * The availability button's accessible name states BOTH what the lesson is
 * and what a click does ("Published — hide from learners"): an eye alone
 * says neither, and this product's rule is that a control states its state
 * and its remedy. The icon is the state (open eye = visible to learners).
 *
 * Renaming swaps the heading for a one-line form — the field is the name,
 * where the name was — with Save and Cancel; Enter and Escape do the same.
 */
export const LessonHeading = ({
  name,
  isAvailable,
  isRenaming,
  isSaving,
  onStartRename,
  onCancelRename,
  onToggleAvailability,
  renameForm,
}: {
  name: string;
  isAvailable: boolean;
  isRenaming: boolean;
  /** A rename or an availability change is in flight. */
  isSaving: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
  onToggleAvailability: () => void;
  /** The rename form's wiring, present while renaming. */
  renameForm: {
    onSubmit: FormEventHandler<HTMLFormElement>;
    registerName: UseFormRegisterReturn<'name'>;
    error?: string;
  } | null;
}) => (
  <div className="flex items-center gap-3">
    {isRenaming && renameForm ? (
      <form
        onSubmit={renameForm.onSubmit}
        noValidate
        className="flex min-w-0 flex-1 flex-col gap-1.5"
      >
        <div className="flex items-center gap-2">
          <input
            {...renameForm.registerName}
            type="text"
            aria-label="Lesson name"
            aria-invalid={!!renameForm.error}
            // biome-ignore lint/a11y/noAutofocus: the field replaces the heading the reader just chose to edit; focus belongs in it
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onCancelRename();
              }
            }}
            className={cn(
              'min-w-0 flex-1 rounded-lg border bg-gray-1 px-3.5 py-2 font-semibold text-2xl text-primary outline-none transition-colors duration-100',
              'focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
              renameForm.error
                ? 'border-error-9 focus-visible:border-error-9 focus-visible:ring-error-9'
                : 'border-gray-6 hover:border-gray-8',
            )}
          />
          <button
            type="submit"
            disabled={isSaving}
            aria-label="Save name"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            Save
          </button>
          <button
            type="button"
            onClick={onCancelRename}
            className="rounded-lg px-3 py-2 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7"
          >
            Cancel
          </button>
        </div>
        {renameForm.error && (
          <p role="alert" className="text-error-text text-sm">
            {renameForm.error}
          </p>
        )}
      </form>
    ) : (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h2 className="min-w-0 break-words font-semibold text-2xl text-primary">
          {name}
        </h2>
        <TooltipIconButton label="Rename lesson" onClick={onStartRename}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      </div>
    )}

    <TooltipIconButton
      label={
        isAvailable
          ? 'Published — hide from learners'
          : 'Draft — show to learners'
      }
      onClick={onToggleAvailability}
      disabled={isSaving}
    >
      {isAvailable ? (
        <Eye className="h-5 w-5" aria-hidden="true" />
      ) : (
        <EyeOff className="h-5 w-5" aria-hidden="true" />
      )}
    </TooltipIconButton>
  </div>
);
