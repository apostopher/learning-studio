import { Loader2 } from 'lucide-react';
import type { FormEventHandler } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '@/lib/cn';

export interface CredentialField {
  name: string;
  label: string;
  type: 'text' | 'password';
  register: UseFormRegisterReturn;
  error?: string;
}

interface ProviderCredentialFormProps {
  fields: CredentialField[];
  onSubmit: FormEventHandler<HTMLFormElement>;
  serverError?: string;
  isPending: boolean;
  submitLabel?: string;
}

/**
 * Renders the credential fields for whichever provider the container has
 * already picked (Mux: signing key id + private key; Synthesia: API key).
 * Fields are write-only: the server never returns secret values, so these
 * inputs never carry a prefilled default.
 */
export const ProviderCredentialForm = ({
  fields,
  onSubmit,
  serverError,
  isPending,
  submitLabel = 'Save credentials',
}: ProviderCredentialFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {fields.map((field) => {
        const inputId = `credential-${field.name}`;
        const errorId = `${inputId}-error`;
        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label
              htmlFor={inputId}
              className="font-medium text-primary text-sm"
            >
              {field.label}
            </label>
            <input
              {...field.register}
              id={inputId}
              type={field.type}
              autoComplete={field.type === 'password' ? 'new-password' : 'off'}
              aria-invalid={!!field.error}
              aria-describedby={field.error ? errorId : undefined}
              className={cn(
                'min-w-0 w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 font-mono text-primary text-sm outline-none transition-colors duration-100 placeholder:text-gray-8',
                'focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
                field.error
                  ? 'border-error-9 focus-visible:border-error-9 focus-visible:ring-error-9'
                  : 'border-gray-6 hover:border-gray-8',
              )}
            />
            {field.error && (
              <p
                id={errorId}
                role="alert"
                aria-live="polite"
                className="text-error-text text-sm"
              >
                {field.error}
              </p>
            )}
          </div>
        );
      })}

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-error-9/40 bg-error-9/15 px-3 py-2.5 text-error-text text-sm"
        >
          {serverError}
        </p>
      )}

      <div className="flex items-center justify-end">
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
          {submitLabel}
        </button>
      </div>
    </form>
  );
};
