import { Loader2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '@/lib/cn';

interface CreateModuleFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<'name'>;
  nameError?: string;
  /** Cover-image picker (an ImageUploadFieldContainer), rendered by the container. */
  imageField: React.ReactNode;
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
  submitLabel?: string;
}

export const CreateModuleForm = ({
  onSubmit,
  registerName,
  nameError,
  imageField,
  serverError,
  isPending,
  onCancel,
  submitLabel = 'Create module',
}: CreateModuleFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="module-name"
          className="text-sm font-medium text-primary"
        >
          Name
        </label>
        <input
          {...registerName}
          id="module-name"
          type="text"
          autoFocus
          aria-invalid={!!nameError}
          aria-describedby={nameError ? 'module-name-error' : undefined}
          className={cn(
            'min-w-0 w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-primary outline-none transition-colors duration-100 placeholder:text-gray-8',
            'focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9',
            nameError
              ? 'border-error-9 focus-visible:ring-error-9 focus-visible:border-error-9'
              : 'border-gray-6 hover:border-gray-8',
          )}
        />
        {nameError && (
          <p
            id="module-name-error"
            role="alert"
            aria-live="polite"
            className="text-sm text-error-text"
          >
            {nameError}
          </p>
        )}
      </div>

      {/* Cover image */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-primary">
          Cover image <span className="text-tertiary">(optional)</span>
        </span>
        {imageField}
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-error-9/40 bg-error-9/15 px-3 py-2.5 text-sm text-error-text"
        >
          {serverError}
        </p>
      )}

      <div className="mt-2 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7"
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
          {submitLabel}
        </button>
      </div>
    </form>
  );
};
