import { Loader2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '#/lib/cn';

interface EditDisciplineFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<'name'>;
  nameError?: string;
  /** The subject-expert picker, rendered by the container inside a `Controller`. */
  expertsField: React.ReactNode;
  expertsFieldId: string;
  /** True while the current roster is still loading, so the picker cannot lie. */
  isLoadingExperts: boolean;
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
}

/**
 * Rename a discipline and set who its subject experts are.
 *
 * One form for both, because they are one act as far as the user is
 * concerned — "edit this discipline" — even though they land on two
 * endpoints. Pure and hookless.
 *
 * While the roster is loading the picker is replaced by a line saying so
 * rather than shown empty: an empty multi-select is indistinguishable from
 * "this discipline has no experts", and submitting it would revoke everyone.
 */
export const EditDisciplineForm = ({
  onSubmit,
  registerName,
  nameError,
  expertsField,
  expertsFieldId,
  isLoadingExperts,
  serverError,
  isPending,
  onCancel,
}: EditDisciplineFormProps) => (
  <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="edit-discipline-name"
        className="font-medium text-primary text-sm"
      >
        Name
      </label>
      <input
        {...registerName}
        id="edit-discipline-name"
        type="text"
        // biome-ignore lint/a11y/noAutofocus: only ever rendered inside a modal dialog the user just opened, where focus belongs on the first field rather than the popup container
        autoFocus
        aria-invalid={!!nameError}
        aria-describedby={nameError ? 'edit-discipline-error' : undefined}
        className={cn(
          'w-full min-w-0 rounded-lg border bg-gray-1 px-3.5 py-2.5 text-primary text-sm outline-none transition-colors duration-100',
          'focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
          nameError
            ? 'border-error-9 focus-visible:border-error-9 focus-visible:ring-error-9'
            : 'border-gray-6 hover:border-gray-8',
        )}
      />
      {nameError && (
        <p
          id="edit-discipline-error"
          role="alert"
          aria-live="polite"
          className="text-error-text text-sm"
        >
          {nameError}
        </p>
      )}
    </div>

    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={expertsFieldId}
        className="font-medium text-primary text-sm"
      >
        Subject experts
      </label>
      {isLoadingExperts ? (
        <p className="rounded-lg border border-gray-6 bg-gray-1 px-3.5 py-2.5 text-secondary text-sm">
          Loading the current experts…
        </p>
      ) : (
        expertsField
      )}
      <p className="text-secondary text-xs">
        A subject expert may edit the content of every lesson filed under this
        discipline. Removing someone here takes that away.
      </p>
    </div>

    {serverError && (
      <p
        role="alert"
        className="rounded-lg border border-error-9/40 bg-error-9/15 px-3 py-2.5 text-error-text text-sm"
      >
        {serverError}
      </p>
    )}

    <div className="mt-2 flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isPending || isLoadingExperts}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm',
          'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        Save changes
      </button>
    </div>
  </form>
);
