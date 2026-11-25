import { Input } from '@base-ui/react/input';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '#/lib/cn';

/**
 * The working copy's version. The hint is there because nothing else says it:
 * an edit under the same version leaves every course's chip green.
 */
export const VersionField = ({
  id,
  formId,
  register,
  error,
  readOnly,
}: {
  id: string;
  /** The form Enter submits: the Save button's, which this field is outside. */
  formId: string;
  register: UseFormRegisterReturn<'version'>;
  error?: string;
  /** A save is in flight. Not `disabled`, which would drop keyboard focus. */
  readOnly: boolean;
}) => {
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
        readOnly={readOnly}
        aria-invalid={!!error}
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        className={cn(
          'w-32 rounded-lg border px-3.5 py-2.5 text-sm tabular-nums outline-none transition-colors duration-100',
          'focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
          readOnly
            ? 'cursor-default bg-gray-3 text-secondary'
            : 'bg-gray-1 text-primary',
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
      <p id={hintId} className="text-secondary text-sm">
        Courses keep their own copy. Change the version to flag an update.
      </p>
    </div>
  );
};
