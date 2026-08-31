import { Dialog } from '@base-ui/react/dialog';
import { Loader2, X } from 'lucide-react';
import type { CourseOption } from './user-detail-modal';

interface AddPersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onEmailChange: (value: string) => void;
  courses: CourseOption[];
  selectedCourseIds: number[];
  onToggleCourse: (courseId: number, selected: boolean) => void;
  onSubmit: () => void;
  isPending: boolean;
  error?: string;
}

/**
 * Records an email and the courses it should have, for someone who may not
 * have an account yet.
 *
 * A dialog rather than the inline header field it replaces, because course
 * selection belongs with the email: the previous form could only ever assign
 * the first course, which quietly made "add someone to a course" wrong for
 * every course but one.
 *
 * No mail is sent — auth is email-OTP, so the account appears when they first
 * sign in and the sign-in hook applies these courses then. The copy says so,
 * because "Add" otherwise implies an invitation went out.
 */
export const AddPersonDialog = ({
  open,
  onOpenChange,
  email,
  onEmailChange,
  courses,
  selectedCourseIds,
  onToggleCourse,
  onSubmit,
  isPending,
  error,
}: AddPersonDialogProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-40 bg-gray-1/70 backdrop-blur-sm" />
      <Dialog.Popup className="dialog-popup fixed inset-0 z-40 m-auto grid h-fit max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[480px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-xl">
        <div className="flex items-center justify-between gap-4 border-gray-6 border-b px-6 py-4">
          <Dialog.Title className="font-semibold text-lg text-primary">
            Add person
          </Dialog.Title>
          <Dialog.Close className="shrink-0 rounded-md p-1.5 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="flex flex-col gap-5 p-6"
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-primary text-sm">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="pilot@example.com"
              // The whole dialog exists to capture this, so it takes focus.
              // biome-ignore lint/a11y/noAutofocus: sole purpose of the dialog
              autoFocus
              className="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            />
            <span className="text-secondary text-xs">
              No email is sent. Their courses are applied automatically the
              first time they sign in.
            </span>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1.5 font-medium text-primary text-sm">
              Courses
            </legend>
            {courses.length === 0 ? (
              <p className="text-secondary text-sm">No courses exist yet.</p>
            ) : (
              courses.map((course) => (
                <label
                  key={course.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={selectedCourseIds.includes(course.id)}
                    onChange={(event) =>
                      onToggleCourse(course.id, event.target.checked)
                    }
                    className="h-4 w-4 accent-apple-9"
                  />
                  <span className="text-primary text-sm">{course.name}</span>
                </label>
              ))
            )}
          </fieldset>

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
              // A person with no course would be recorded nowhere: pending rows
              // are (email, course) pairs, so there is nothing to store.
              disabled={
                isPending ||
                email.trim() === '' ||
                selectedCourseIds.length === 0
              }
              className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
            >
              {isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Add person
            </button>
          </div>
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
