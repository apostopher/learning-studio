import { Loader2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '@/lib/cn';

interface CreateCourseFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn<'name'>;
  registerDescription: UseFormRegisterReturn<'description'>;
  registerImageUrl: UseFormRegisterReturn<'imageUrl'>;
  errors: { name?: string; description?: string; imageUrl?: string };
  serverError?: string;
  isPending: boolean;
  onCancel: () => void;
}

const inputBase = cn(
  'w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none',
  'placeholder:text-gray-8',
  'transition-colors duration-100',
  'focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9',
);

export const CreateCourseForm = ({
  onSubmit,
  registerName,
  registerDescription,
  registerImageUrl,
  errors,
  serverError,
  isPending,
  onCancel,
}: CreateCourseFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="course-name"
          className="text-sm font-medium text-gray-12"
        >
          Name
        </label>
        <input
          {...registerName}
          id="course-name"
          type="text"
          autoFocus
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'course-name-error' : undefined}
          className={cn(
            inputBase,
            errors.name
              ? 'border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9'
              : 'border-gray-6 hover:border-gray-8',
          )}
        />
        {errors.name && (
          <p
            id="course-name-error"
            role="alert"
            aria-live="polite"
            className="text-sm text-red-11"
          >
            {errors.name}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="course-description"
          className="text-sm font-medium text-gray-12"
        >
          Description <span className="text-gray-10">(optional)</span>
        </label>
        <textarea
          {...registerDescription}
          id="course-description"
          rows={3}
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? 'course-description-error' : undefined
          }
          className={cn(
            inputBase,
            'resize-y',
            errors.description
              ? 'border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9'
              : 'border-gray-6 hover:border-gray-8',
          )}
        />
        {errors.description && (
          <p
            id="course-description-error"
            role="alert"
            aria-live="polite"
            className="text-sm text-red-11"
          >
            {errors.description}
          </p>
        )}
      </div>

      {/* Image URL */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="course-image-url"
          className="text-sm font-medium text-gray-12"
        >
          Image URL <span className="text-gray-10">(optional)</span>
        </label>
        <input
          {...registerImageUrl}
          id="course-image-url"
          type="url"
          placeholder="https://…"
          aria-invalid={!!errors.imageUrl}
          aria-describedby={
            errors.imageUrl ? 'course-image-url-error' : undefined
          }
          className={cn(
            inputBase,
            errors.imageUrl
              ? 'border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9'
              : 'border-gray-6 hover:border-gray-8',
          )}
        />
        {errors.imageUrl && (
          <p
            id="course-image-url-error"
            role="alert"
            aria-live="polite"
            className="text-sm text-red-11"
          >
            {errors.imageUrl}
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
          Create course
        </button>
      </div>
    </form>
  );
};
