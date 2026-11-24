import { Input } from '@base-ui/react/input';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '#/lib/cn';

/**
 * The working copy's version number. `lockedReason` stays visible for as long
 * as the lesson is locked, and is part of the field's accessible description.
 */
export const VersionField = ({
  id,
  formId,
  register,
  error,
  lockedReason,
  disabled,
}: {
  id: string;
  /** The form Enter submits: the Save button's, which this field is outside. */
  formId: string;
  register: UseFormRegisterReturn<'version'>;
  error?: string;
  /** Why content cannot be changed at the current version; null when it can. */
  lockedReason: string | null;
  disabled: boolean;
}) => {
  // A refusal often IS the locked reason; said once, as the error.
  const hint = lockedReason !== error ? lockedReason : null;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-primary text-sm">
        Version
      </label>
      <Input
        {...register}
        id={id}
        form={formId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={
          [hint && hintId, error && errorId].filter(Boolean).join(' ') ||
          undefined
        }
        className={cn(
          'w-32 rounded-lg border bg-gray-1 px-3.5 py-2.5 text-primary text-sm tabular-nums outline-none transition-colors duration-100',
          'focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60',
          error
            ? 'border-error-9 focus-visible:border-error-9 focus-visible:ring-error-9'
            : 'border-gray-6 hover:border-gray-8',
        )}
      />
      {error && (
        <p id={errorId} role="alert" className="text-error-text text-sm">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-secondary text-sm">
          {hint}
        </p>
      )}
    </div>
  );
};
