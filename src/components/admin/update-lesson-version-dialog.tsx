import { AlertDialog } from '@base-ui/react/alert-dialog';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { formatVersion } from '#/lib/lesson-version';

/**
 * Asks before moving one course to the version Disciplines is on. Rendered
 * inside the container's `AlertDialog.Root`; pure, all state arrives as props.
 */
export const UpdateLessonVersionDialog = ({
  lessonName,
  courseName,
  from,
  to,
  contentUpdatedAt,
  isPending,
  error,
  onConfirm,
}: {
  lessonName: string;
  courseName: string;
  from: string;
  to: string;
  contentUpdatedAt: Date;
  isPending: boolean;
  error?: string;
  onConfirm: () => void;
}) => (
  <AlertDialog.Portal>
    <AlertDialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
    <AlertDialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
      <AlertDialog.Title className="font-semibold text-lg text-primary">
        Do you want to update this lesson?
      </AlertDialog.Title>
      <AlertDialog.Description className="mbs-3 flex flex-col gap-2 text-secondary text-sm">
        <span className="break-words">
          <span className="font-medium text-primary">{lessonName}</span> in{' '}
          <span className="font-medium text-primary">{courseName}</span>
        </span>
        <span className="font-medium text-primary tabular-nums">
          <span aria-hidden="true">
            {formatVersion(from)} → {formatVersion(to)}
          </span>
          <span className="sr-only">
            From {formatVersion(from)} to {formatVersion(to)}.
          </span>
        </span>
        <span>Last edited {format(contentUpdatedAt, 'd MMM yyyy, HH:mm')}</span>
        <span>
          Learners keep their progress. A debrief they have not passed starts
          over. You cannot go back to {formatVersion(from)}.
        </span>
      </AlertDialog.Description>
      {error && (
        <p
          role="alert"
          className="mbs-4 rounded-lg border border-error-7 bg-error-3 px-3 py-2.5 text-error-text text-sm"
        >
          {error}
        </p>
      )}
      <div className="mbs-6 flex items-center justify-end gap-3">
        {/* `aria-disabled`, not `disabled`, on both: an update in flight must
            not drop keyboard focus out of the dialog. The container ignores a
            close meanwhile. */}
        <AlertDialog.Close
          aria-disabled={isPending || undefined}
          className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          Cancel
        </AlertDialog.Close>
        <button
          type="button"
          onClick={isPending ? undefined : onConfirm}
          aria-disabled={isPending || undefined}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed"
        >
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {isPending ? 'Updating…' : 'Update lesson'}
        </button>
      </div>
    </AlertDialog.Popup>
  </AlertDialog.Portal>
);
