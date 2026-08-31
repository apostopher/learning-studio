import { Loader2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '#/lib/cn';

interface RenameDisciplineFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<'name'>;
  nameError?: string;
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
}

/**
 * Rename one discipline. Pure and hookless.
 *
 * Its own component rather than a reuse of `CreateLessonForm`, whose field is
 * hardcoded to `id="lesson-name"`: two dialogs mounted at the editor root at
 * once would then share a DOM id, and the wrong label would point at the wrong
 * input.
 */
export const RenameDisciplineForm = ({
  onSubmit,
  registerName,
  nameError,
  serverError,
  isPending,
  onCancel,
}: RenameDisciplineFormProps) => (
  <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="rename-discipline-name"
        className="font-medium text-primary text-sm"
      >
        Name
      </label>
      <input
        {...registerName}
        id="rename-discipline-name"
        type="text"
        // biome-ignore lint/a11y/noAutofocus: only ever rendered inside a modal dialog the user just opened, where focus belongs on the first field rather than the popup container
        autoFocus
        aria-invalid={!!nameError}
        aria-describedby={nameError ? 'rename-discipline-error' : undefined}
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
          id="rename-discipline-error"
          role="alert"
          aria-live="polite"
          className="text-error-text text-sm"
        >
          {nameError}
        </p>
      )}
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
        Save name
      </button>
    </div>
  </form>
);
