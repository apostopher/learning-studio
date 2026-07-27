import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '@/lib/cn';

const CONFIRM_PHRASE = 'permanently delete';

interface DeleteConfirmFormProps {
  /** Warning copy shown above the confirmation input (entity-specific). */
  warning: ReactNode;
  submitLabel: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerConfirm: UseFormRegisterReturn<'confirm'>;
  canSubmit: boolean;
  isPending: boolean;
  serverError?: string;
  onCancel: () => void;
}

/**
 * Destructive-action confirmation form: the submit button stays disabled until
 * the user types "permanently delete". Reused for module and course deletion.
 */
export const DeleteConfirmForm = ({
  warning,
  submitLabel,
  onSubmit,
  registerConfirm,
  canSubmit,
  isPending,
  serverError,
  onCancel,
}: DeleteConfirmFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-secondary">{warning}</p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="delete-confirm"
          className="text-sm font-medium text-primary"
        >
          Type{' '}
          <span className="font-mono text-secondary">{CONFIRM_PHRASE}</span> to
          confirm
        </label>
        <input
          {...registerConfirm}
          id="delete-confirm"
          type="text"
          autoFocus
          autoComplete="off"
          placeholder={CONFIRM_PHRASE}
          className={cn(
            'min-w-0 w-full rounded-lg border border-gray-6 bg-gray-1 px-3.5 py-2.5 text-sm text-primary outline-none transition-colors placeholder:text-gray-8',
            'hover:border-gray-8 focus-visible:ring-2 focus-visible:ring-red-9 focus-visible:border-red-9',
          )}
        />
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-red-9/40 bg-red-9/15 px-3 py-2.5 text-sm text-error-text"
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
          disabled={!canSubmit || isPending}
          className={cn(
            // red-9 is bright in both themes (#e5484d / #ff6369): black text
            // clears WCAG AA (5.37 / 7.24) where white/red-1 do not. No
            // "red-contrast" token is generated, so black is the correct choice.
            'inline-flex items-center justify-center gap-2 rounded-lg bg-red-9 px-4 py-2.5 text-sm font-medium text-black',
            'transition-colors hover:bg-red-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-9 focus-visible:ring-offset-2',
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
