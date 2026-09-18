import { Loader2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '#/lib/cn';
import { DeleteConfirmForm } from './delete-confirm-form';

interface DeleteDisciplineConfirmProps {
  disciplineName: string;
  /** Lessons still filed under it. Any at all, and the delete is refused. */
  lessonCount: number;
  serverError?: string;
  isPending: boolean;
  /** The typed-name field, from the container's form. */
  registerConfirm: UseFormRegisterReturn<'confirm'>;
  /** Whether what was typed names the discipline — the container decides. */
  canSubmit: boolean;
  /** The form submit; only reachable once `canSubmit`. */
  onConfirm: React.FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
}

/**
 * Confirm deleting one discipline, or explain why it cannot be deleted.
 *
 * Two states, one component, because they answer the same question and the
 * user cannot tell in advance which they will get. While the discipline still
 * holds lessons the delete is refused — `lessons.discipline_id` is
 * `on delete no action`, so the database would refuse it too — and the block
 * is stated in VISIBLE text with the count, because the count is the whole
 * instruction: it says how much work stands between the user and the delete.
 *
 * Nothing is reassigned on the user's behalf. Sweeping an expert's lessons
 * into the admin-only "Untitled" queue would strip their authorship of every
 * one of them as a side effect of a click aimed at something else.
 *
 * The confirm button is `aria-disabled` as well as `disabled` so the reason
 * above it is announced with the control rather than only seen next to it.
 *
 * When nothing blocks it, the confirmation is `DeleteConfirmForm` — the
 * same typed-name gate every other delete in the admin uses.
 */
export const DeleteDisciplineConfirm = ({
  disciplineName,
  lessonCount,
  serverError,
  isPending,
  registerConfirm,
  canSubmit,
  onConfirm,
  onCancel,
}: DeleteDisciplineConfirmProps) => {
  const blocked = lessonCount > 0;
  const lessonNoun = lessonCount === 1 ? 'lesson' : 'lessons';
  const blockedReason = `${disciplineName} still has ${lessonCount} ${lessonNoun}. Move them to another discipline first, then delete it.`;

  if (!blocked) {
    return (
      <DeleteConfirmForm
        confirmPhrase={disciplineName}
        warning={
          <>
            Delete{' '}
            <span className="font-medium text-primary">{disciplineName}</span>?
            It holds no lessons, so nothing else is removed. This can't be
            undone.
          </>
        }
        submitLabel="Delete discipline"
        onSubmit={onConfirm}
        registerConfirm={registerConfirm}
        canSubmit={canSubmit}
        isPending={isPending}
        serverError={serverError}
        onCancel={onCancel}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p
        id="delete-discipline-reason"
        className={cn(
          'text-sm',
          blocked
            ? 'rounded-lg border border-error-9/40 bg-error-9/15 px-3 py-2.5 text-error-text'
            : 'text-secondary',
        )}
      >
        {blocked ? (
          blockedReason
        ) : (
          <>
            Delete{' '}
            <span className="font-medium text-primary">{disciplineName}</span>?
            It holds no lessons, so nothing else is removed. This can't be
            undone.
          </>
        )}
      </p>

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
          type="button"
          disabled
          aria-disabled
          // The refusal is the button's own description, not just text nearby:
          // a screen-reader user who tabs straight to it hears why it is dead.
          aria-describedby="delete-discipline-reason"
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-lg bg-error px-4 py-2.5 font-medium text-on-error text-sm',
            'transition-colors hover:bg-error-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Delete discipline
        </button>
      </div>
    </div>
  );
};
