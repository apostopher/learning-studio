import { Loader2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '@/lib/cn';

const CONFIRM_PHRASE = 'permanently delete';

interface DeleteModuleConfirmFormProps {
  moduleName: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerConfirm: UseFormRegisterReturn<'confirm'>;
  canSubmit: boolean;
  isPending: boolean;
  serverError?: string;
  onCancel: () => void;
}

export const DeleteModuleConfirmForm = ({
  moduleName,
  onSubmit,
  registerConfirm,
  canSubmit,
  isPending,
  serverError,
  onCancel,
}: DeleteModuleConfirmFormProps) => {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-gray-11">
        Deleting <span className="font-medium text-gray-12">{moduleName}</span>{' '}
        will permanently delete the module and all of its lessons. This can't be
        undone.
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="delete-confirm"
          className="text-sm font-medium text-gray-12"
        >
          Type <span className="font-mono text-gray-11">{CONFIRM_PHRASE}</span>{' '}
          to confirm
        </label>
        <input
          {...registerConfirm}
          id="delete-confirm"
          type="text"
          autoFocus
          autoComplete="off"
          placeholder={CONFIRM_PHRASE}
          className={cn(
            'min-w-0 w-full rounded-lg border border-gray-6 bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none transition-colors placeholder:text-gray-8',
            'hover:border-gray-8 focus-visible:ring-2 focus-visible:ring-red-9 focus-visible:border-red-9',
          )}
        />
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
          Delete module
        </button>
      </div>
    </form>
  );
};
