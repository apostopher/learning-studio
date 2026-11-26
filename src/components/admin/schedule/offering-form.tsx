import { Loader2, Printer } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { cn } from '#/lib/cn';

const fieldClassName = (invalid: boolean) =>
  cn(
    'w-full rounded-lg border bg-gray-1 px-3 py-2 font-mono text-primary text-sm outline-none transition-colors',
    invalid
      ? 'border-error-9 focus-visible:ring-2 focus-visible:ring-error-9'
      : 'border-gray-6 hover:border-gray-8 focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
  );

const labelClassName =
  'font-semibold text-secondary text-xs uppercase tracking-wider';

/**
 * The offering popover's body.
 *
 * Three date controls that are really TWO facts plus a convenience: the start,
 * the end, and the number of days between them. The window is offered because
 * that is how a course length is actually decided ("give them 45 days"), but
 * it is derived, never stored — see `offeringFormSchema`. Editing any one of
 * the three updates the others, which is the container's job.
 *
 * Presentational throughout. The roster table and the search-and-add control
 * arrive as nodes because both own state this component must not.
 */
export const OfferingForm = ({
  startsOn,
  onStartsOnChange,
  startsOnError,
  startsOnRef,
  windowDays,
  onWindowDaysChange,
  endsOn,
  onEndsOnChange,
  endsOnError,
  arriveAt,
  onArriveAtChange,
  arriveAtError,
  arriveAtRef,
  summaryLine,
  rosterCount,
  addPerson,
  rosterTable,
  onSubmit,
  onCancel,
  onPrint,
  onDelete,
  isSaving,
  submitLabel,
  saveError,
  discardConfirm,
}: {
  startsOn: string;
  onStartsOnChange: (next: string) => void;
  startsOnError?: string;
  /** The container focuses this input when the popover pins. */
  startsOnRef?: Ref<HTMLInputElement>;
  /** Days from start to end, both ends included. Empty while being retyped. */
  windowDays: string;
  onWindowDaysChange: (next: string) => void;
  endsOn: string;
  onEndsOnChange: (next: string) => void;
  endsOnError?: string;
  /** The day students report to the training center; empty when none. */
  arriveAt: string;
  onArriveAtChange: (next: string) => void;
  arriveAtError?: string;
  /** The container reads a half-typed date off this input, and focuses it. */
  arriveAtRef?: Ref<HTMLInputElement>;
  /** "103 calendar days — 14 weeks and 5 days", or null if the dates are bad. */
  summaryLine: string | null;
  /** "8 people", for the roster heading. */
  rosterCount: string;
  addPerson: ReactNode;
  rosterTable: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  /** Opens the print dialog on an A4 sheet of the dates and the roster. */
  onPrint: () => void;
  /** Absent when creating — there is nothing to unschedule yet. */
  onDelete?: () => void;
  isSaving: boolean;
  submitLabel: string;
  saveError?: string;
  /** When present it replaces the footer button row. */
  discardConfirm?: ReactNode;
}) => (
  <form
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
    className="flex flex-col gap-4"
  >
    {/* The dates, their errors and the summary line are one block: the
        summary reads the three fields back, so it sits snug under them
        (gap-1), while the form's gap-4 still parts this block from the
        roster below. */}
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] items-start gap-2.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="offering-starts-on" className={labelClassName}>
            Start date
          </label>
          <input
            ref={startsOnRef}
            id="offering-starts-on"
            type="date"
            value={startsOn}
            onChange={(event) => onStartsOnChange(event.target.value)}
            aria-invalid={startsOnError ? true : undefined}
            aria-describedby={
              startsOnError ? 'offering-starts-on-error' : undefined
            }
            className={fieldClassName(Boolean(startsOnError))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          {/* "Window" alone on screen; the unit is spoken via the hint the input
            is described by, and printed in the summary line beneath. */}
          <label htmlFor="offering-window-days" className={labelClassName}>
            Window
          </label>
          <input
            id="offering-window-days"
            type="number"
            inputMode="numeric"
            min={1}
            value={windowDays}
            onChange={(event) => onWindowDaysChange(event.target.value)}
            aria-describedby="offering-window-unit"
            className={fieldClassName(false)}
          />
          <span id="offering-window-unit" className="sr-only">
            calendar days
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="offering-ends-on" className={labelClassName}>
            Complete by
          </label>
          <input
            id="offering-ends-on"
            type="date"
            value={endsOn}
            min={startsOn || undefined}
            onChange={(event) => onEndsOnChange(event.target.value)}
            aria-invalid={endsOnError ? true : undefined}
            aria-describedby={
              endsOnError ? 'offering-ends-on-error' : undefined
            }
            className={fieldClassName(Boolean(endsOnError))}
          />
        </div>
      </div>
      {/* Errors under the row, full width: in a 3-column row a message under one
        narrow field would wrap to a word per line. */}
      {startsOnError && (
        <p
          id="offering-starts-on-error"
          role="alert"
          className="text-error-text text-sm"
        >
          {startsOnError}
        </p>
      )}
      {endsOnError && (
        <p
          id="offering-ends-on-error"
          role="alert"
          className="text-error-text text-sm"
        >
          {endsOnError}
        </p>
      )}

      {/* The dates' columns again: this field spans the last two, where a
          whole date still fits on a phone. */}
      <div className="grid grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] items-start gap-2.5">
        <p className="text-pretty font-mono font-semibold text-primary text-sm">
          {summaryLine}
        </p>
        <div className="col-span-2 flex flex-col gap-1.5 pbs-2">
          <label htmlFor="offering-arrive-at" className={labelClassName}>
            Arrive at training center{' '}
            <span className="font-normal normal-case tracking-normal">
              (optional)
            </span>
          </label>
          <input
            ref={arriveAtRef}
            id="offering-arrive-at"
            type="date"
            value={arriveAt}
            onChange={(event) => onArriveAtChange(event.target.value)}
            aria-invalid={arriveAtError ? true : undefined}
            aria-describedby={
              arriveAtError ? 'offering-arrive-at-error' : undefined
            }
            className={fieldClassName(Boolean(arriveAtError))}
          />
          {arriveAtError && (
            <p
              id="offering-arrive-at-error"
              role="alert"
              className="text-error-text text-sm"
            >
              {arriveAtError}
            </p>
          )}
        </div>
      </div>
    </div>

    <div className="flex flex-col gap-3">
      <h3 className={labelClassName}>On this offering · {rosterCount}</h3>
      {addPerson}
      {rosterTable}
    </div>

    {saveError && (
      <p role="alert" className="text-error-text text-sm">
        {saveError}
      </p>
    )}

    {discardConfirm ?? (
      <div className="flex items-center gap-2 pbs-1">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isSaving}
            className="me-auto rounded-lg px-3 py-2 font-medium text-error-text text-sm transition-colors hover:bg-error-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 disabled:opacity-60"
          >
            Unschedule
          </button>
        )}
        <button
          type="button"
          onClick={onPrint}
          className="ms-auto inline-flex items-center gap-2 rounded-lg border border-gray-6 px-4 py-2 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-lg border border-gray-6 px-4 py-2 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-4 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isSaving && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {submitLabel}
        </button>
      </div>
    )}
  </form>
);
