import { Popover } from '@base-ui/react/popover';
import { Loader2 } from 'lucide-react';
import type { FormEventHandler, InputHTMLAttributes, Ref } from 'react';

/**
 * A course's pass mark as a small button that opens a one-field editor.
 *
 * Presentational: open state, the form and the save all belong to the
 * container. The only state here is Base UI's own popover plumbing.
 */
export const CoursePassMark = ({
  courseId,
  courseName,
  passMark,
  open,
  onOpenChange,
  onSubmit,
  onCancel,
  inputProps,
  inputRef,
  fieldError,
  serverError,
  isPending,
}: {
  courseId: number;
  courseName: string;
  passMark: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
  /** react-hook-form's `register('passMark')` result, minus the ref. */
  inputProps: InputHTMLAttributes<HTMLInputElement>;
  inputRef?: Ref<HTMLInputElement>;
  fieldError?: string;
  serverError?: string;
  isPending: boolean;
}) => (
  <Popover.Root open={open} onOpenChange={onOpenChange}>
    <Popover.Trigger
      aria-label={`Pass mark for ${courseName}, currently ${passMark}`}
      className="inline-flex min-h-6 min-w-6 items-center rounded-md px-1.5 py-1 text-secondary text-xs underline decoration-gray-7 underline-offset-2 transition-colors hover:bg-gray-3 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9"
    >
      Pass mark {passMark}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner sideOffset={6} className="z-50">
        <Popover.Popup className="w-64 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg">
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
            <label
              htmlFor={`pass-mark-input-${courseId}`}
              className="font-medium text-primary text-sm"
            >
              Pass mark
            </label>
            <input
              id={`pass-mark-input-${courseId}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={`pass-mark-hint-${courseId}`}
              {...inputProps}
              ref={inputRef}
              className="rounded-md border border-gray-7 bg-gray-1 px-2 py-1.5 text-base text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9"
            />
            <p
              id={`pass-mark-hint-${courseId}`}
              className="text-secondary text-xs"
            >
              0–100: lessons pass at this total score
            </p>
            {fieldError ? (
              <p role="alert" className="text-error-text text-xs">
                {fieldError}
              </p>
            ) : null}
            {serverError ? (
              <p role="alert" className="text-error-text text-xs">
                {serverError}
              </p>
            ) : null}
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md px-2 py-1 text-secondary text-xs hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                aria-busy={isPending}
                className="inline-flex items-center gap-1 rounded-md bg-apple-9 px-2 py-1 font-medium text-apple-contrast text-xs hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2
                    className="h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {isPending ? 'Saving' : 'Save'}
              </button>
            </div>
          </form>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
);
