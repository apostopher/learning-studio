import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Loader2 } from 'lucide-react';

/**
 * The body of the "remove module from course" confirmation. Rendered inside
 * the container's `AlertDialog.Root`; pure, all state arrives as props.
 */
export const RemoveCourseModuleDialog = ({
  moduleName,
  courseName,
  otherCourseCount,
  isPending,
  onConfirm,
}: {
  moduleName: string;
  courseName: string;
  /** Courses remixing this one, which lose the module too. */
  otherCourseCount: number;
  isPending: boolean;
  onConfirm: () => void;
}) => (
  <AlertDialog.Portal>
    <AlertDialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
    <AlertDialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
      <AlertDialog.Title className="font-semibold text-lg text-primary">
        Remove “{moduleName}” from {courseName}?
      </AlertDialog.Title>
      <AlertDialog.Description className="mt-3 flex flex-col gap-2 text-secondary text-sm">
        <span>
          Its lessons stay in the library and learners keep their progress. The
          module’s own settings — name, image, access and prerequisites — are
          removed with it.
        </span>
        {otherCourseCount > 0 && (
          <span>
            {otherCourseCount === 1
              ? '1 other course shows'
              : `${otherCourseCount} other courses show`}{' '}
            this module through a remix and will lose it too.
          </span>
        )}
      </AlertDialog.Description>
      {/* Same buttons as `DeleteConfirmForm`, so the two confirmations read
          as one family. */}
      <div className="mt-6 flex items-center justify-end gap-3">
        <AlertDialog.Close className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7">
          Cancel
        </AlertDialog.Close>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-error px-4 py-2.5 font-medium text-on-error text-sm transition-colors hover:bg-error-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {isPending ? 'Removing…' : 'Remove module'}
        </button>
      </div>
    </AlertDialog.Popup>
  </AlertDialog.Portal>
);
