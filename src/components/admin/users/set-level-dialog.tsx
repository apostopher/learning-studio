import { Dialog } from '@base-ui/react/dialog';
import { Loader2, X } from 'lucide-react';
import type { FormEventHandler } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { LEVEL_LABELS } from '#/lib/level-labels';
import type { UserLevel } from '#/types';

interface SetLevelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseName: string;
  level: UserLevel;
  onSubmit: FormEventHandler<HTMLFormElement>;
  registerMessage: UseFormRegisterReturn;
  registerNote: UseFormRegisterReturn;
  messageError?: string;
  isPending: boolean;
  error?: string;
}

/**
 * Confirms a level change with a message for the pilot before it is written.
 *
 * `message` is required because it is the only thing the pilot sees when
 * this change can *reduce* what they have access to — a silent demotion would
 * just look like lessons vanishing. `note` is admin-only context that never
 * leaves this screen.
 */
export const SetLevelDialog = ({
  open,
  onOpenChange,
  courseName,
  level,
  onSubmit,
  registerMessage,
  registerNote,
  messageError,
  isPending,
  error,
}: SetLevelDialogProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-gray-1/70 backdrop-blur-sm" />
      <Dialog.Popup className="dialog-popup fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[480px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-xl">
        <div className="flex items-center justify-between gap-4 border-gray-6 border-b px-6 py-4">
          <div className="flex flex-col">
            <Dialog.Title className="font-semibold text-lg text-primary">
              Set level to {LEVEL_LABELS[level]}
            </Dialog.Title>
            <Dialog.Description className="text-secondary text-sm">
              {courseName}
            </Dialog.Description>
          </div>
          <Dialog.Close className="shrink-0 rounded-md p-1.5 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-4 p-6"
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-primary text-sm">
              Message for the pilot
            </span>
            <textarea
              {...registerMessage}
              rows={3}
              // biome-ignore lint/a11y/noAutofocus: sole purpose of the dialog
              autoFocus
              aria-invalid={!!messageError}
              aria-describedby={
                messageError ? 'level-message-error' : undefined
              }
              placeholder="Why the level is changing, in a sentence they'll understand."
              className="w-full resize-none rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            />
            <span className="text-secondary text-xs">
              Shown to the pilot. Required.
            </span>
            {messageError && (
              <p
                id="level-message-error"
                role="alert"
                aria-live="polite"
                className="text-error-text text-sm"
              >
                {messageError}
              </p>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-primary text-sm">
              Note (admin-only)
            </span>
            <textarea
              {...registerNote}
              rows={2}
              placeholder="Context for other admins. Never shown to the pilot."
              className="w-full resize-none rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border border-gray-6 px-3 py-2 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
              Cancel
            </Dialog.Close>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
            >
              {isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Save
            </button>
          </div>
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
