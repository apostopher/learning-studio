import { Loader2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '#/lib/cn';

interface CreateDisciplineFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<'name'>;
  nameError?: string;
  /**
   * The subject-expert picker (a `DisciplineExpertPickerContainer`), rendered
   * by the container inside a `Controller`. It arrives as a node because the
   * picker owns a search of its own, which a presentational form has no
   * business running.
   *
   * Omitted entirely for an actor who may not appoint experts. The whole
   * field goes, label and help text with it — not a disabled input: both the
   * people search and the grant are `requireAdmin`, so a course manager
   * creating a discipline has nothing to gain from seeing a control that
   * would 403 twice over.
   */
  expertsField?: React.ReactNode;
  expertsFieldId: string;
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
}

/**
 * Name a new discipline and, if the actor may, appoint its subject experts.
 *
 * Pure and hookless. The two fields are unequal on purpose: the name is
 * required and creates the discipline, while the experts are optional, are
 * granted afterwards one request each, and are admin-only — so the copy under
 * the picker says plainly what a subject expert may then do, rather than
 * leaving "SME" to be inferred from an acronym.
 */
export const CreateDisciplineForm = ({
  onSubmit,
  registerName,
  nameError,
  expertsField,
  expertsFieldId,
  serverError,
  isPending,
  onCancel,
}: CreateDisciplineFormProps) => (
  <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="discipline-name"
        className="font-medium text-primary text-sm"
      >
        Name
      </label>
      <input
        {...registerName}
        id="discipline-name"
        type="text"
        // biome-ignore lint/a11y/noAutofocus: only ever rendered inside a modal dialog the user just opened, where focus belongs on the first field rather than the popup container
        autoFocus
        aria-invalid={!!nameError}
        aria-describedby={nameError ? 'discipline-name-error' : undefined}
        className={cn(
          'w-full min-w-0 rounded-lg border bg-gray-1 px-3.5 py-2.5 text-primary text-sm outline-none transition-colors duration-100 placeholder:text-gray-8',
          'focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
          nameError
            ? 'border-error-9 focus-visible:border-error-9 focus-visible:ring-error-9'
            : 'border-gray-6 hover:border-gray-8',
        )}
      />
      {nameError && (
        <p
          id="discipline-name-error"
          role="alert"
          aria-live="polite"
          className="text-error-text text-sm"
        >
          {nameError}
        </p>
      )}
    </div>

    {expertsField && (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={expertsFieldId}
          className="font-medium text-primary text-sm"
        >
          Subject experts <span className="text-tertiary">(optional)</span>
        </label>
        {expertsField}
        <p className="text-secondary text-xs">
          A subject expert may edit the content of every lesson filed under this
          discipline. You can add or remove them later.
        </p>
      </div>
    )}

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
        disabled={isPending}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm',
          'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        Create discipline
      </button>
    </div>
  </form>
);
