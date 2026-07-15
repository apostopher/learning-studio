import { Loader2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '@/lib/cn';

interface CreateLessonFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<'name'>;
  nameError?: string;
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
}

export const CreateLessonForm = ({
  onSubmit,
  registerName,
  nameError,
  serverError,
  isPending,
  onCancel,
}: CreateLessonFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="lesson-name"
          className="text-sm font-medium text-gray-12"
        >
          Name
        </label>
        <input
          {...registerName}
          id="lesson-name"
          type="text"
          autoFocus
          aria-invalid={!!nameError}
          aria-describedby={nameError ? 'lesson-name-error' : undefined}
          className={cn(
            'min-w-0 w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none transition-colors duration-100 placeholder:text-gray-8',
            'focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9',
            nameError
              ? 'border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9'
              : 'border-gray-6 hover:border-gray-8',
          )}
        />
        {nameError && (
          <p
            id="lesson-name-error"
            role="alert"
            aria-live="polite"
            className="text-sm text-red-11"
          >
            {nameError}
          </p>
        )}
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-red-9/40 bg-red-9/15 px-3 py-2.5 text-sm text-red-11"
        >
          {serverError}
        </p>
      )}

      <div className="mt-2 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-11 transition-colors hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 text-sm font-medium text-apple-contrast',
            'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
        >
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Create lesson
        </button>
      </div>
    </form>
  );
};
