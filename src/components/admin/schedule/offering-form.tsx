import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

const fieldClassName = (invalid: boolean) =>
  cn(
    'w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 font-mono text-primary text-sm outline-none transition-colors',
    invalid
      ? 'border-error-9 focus-visible:ring-2 focus-visible:ring-error-9'
      : 'border-gray-6 hover:border-gray-8 focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
  );

const labelClassName =
  'font-semibold text-secondary text-xs uppercase tracking-wider';

/**
 * The offering dialog's body.
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
  windowDays,
  onWindowDaysChange,
  endsOn,
  onEndsOnChange,
  endsOnError,
  summaryLine,
  rosterCount,
  addPerson,
  rosterTable,
  onSubmit,
  onCancel,
  onDelete,
  isSaving,
  submitLabel,
  saveError,
}: {
  startsOn: string;
  onStartsOnChange: (next: string) => void;
  startsOnError?: string;
  /** Days from start to end, both ends included. Empty while being retyped. */
  windowDays: string;
  onWindowDaysChange: (next: string) => void;
  endsOn: string;
  onEndsOnChange: (next: string) => void;
  endsOnError?: string;
  /** "103 calendar days — 14 weeks and 5 days", or null if the dates are bad. */
  summaryLine: string | null;
  /** "8 people", for the roster heading. */
  rosterCount: string;
  addPerson: ReactNode;
  rosterTable: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  /** Absent when creating — there is nothing to unschedule yet. */
  onDelete?: () => void;
  isSaving: boolean;
  submitLabel: string;
  saveError?: string;
}) => (
  <form
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
    className="flex flex-col gap-5"
  >
    <div className="flex flex-col gap-1.5">
      <label htmlFor="offering-starts-on" className={labelClassName}>
        Start date
      </label>
      <input
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
      {startsOnError && (
        <p
          id="offering-starts-on-error"
          role="alert"
          className="text-error-text text-sm"
        >
          {startsOnError}
        </p>
      )}
    </div>

    <div className="flex flex-col gap-1.5">
      <label htmlFor="offering-window-days" className={labelClassName}>
        Completion window — calendar days
      </label>
      <input
        id="offering-window-days"
        type="number"
        inputMode="numeric"
        min={1}
        value={windowDays}
        onChange={(event) => onWindowDaysChange(event.target.value)}
        aria-describedby="offering-window-hint"
        className={fieldClassName(false)}
      />
    </div>

    <div className="flex flex-col gap-1.5">
      <label htmlFor="offering-ends-on" className={labelClassName}>
        Must be complete by
      </label>
      <input
        id="offering-ends-on"
        type="date"
        value={endsOn}
        min={startsOn || undefined}
        onChange={(event) => onEndsOnChange(event.target.value)}
        aria-invalid={endsOnError ? true : undefined}
        aria-describedby={endsOnError ? 'offering-ends-on-error' : undefined}
        className={fieldClassName(Boolean(endsOnError))}
      />
      {endsOnError && (
        <p
          id="offering-ends-on-error"
          role="alert"
          className="text-error-text text-sm"
        >
          {endsOnError}
        </p>
      )}
    </div>

    {summaryLine && (
      <p className="font-mono font-semibold text-primary text-sm">
        {summaryLine}
      </p>
    )}

    <p id="offering-window-hint" className="text-secondary text-sm">
      This window is the <strong className="text-primary">ground school</strong>
      , done remotely: how long a student has to finish every lesson, quiz and
      debrief before they travel. It closes the day they arrive on site, so
      every student has to be through the whole curriculum by the end date — not
      merely keeping up.
    </p>

    <div className="flex flex-col gap-3 border-gray-6 border-t pt-5">
      <h3 className={labelClassName}>On this offering · {rosterCount}</h3>
      {addPerson}
      {rosterTable}
    </div>

    {saveError && (
      <p role="alert" className="text-error-text text-sm">
        {saveError}
      </p>
    )}

    <div className="flex items-center gap-2 pt-1">
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
        onClick={onCancel}
        disabled={isSaving}
        className="ms-auto rounded-lg border border-gray-6 px-4 py-2 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9 disabled:opacity-60"
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
  </form>
);
