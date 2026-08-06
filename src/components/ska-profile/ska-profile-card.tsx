import { Check, Loader2 } from 'lucide-react';
import type { FormEventHandler } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { SKA_SECTION_MAX_CHARS } from '#/types';

export type SkaProfileField = {
  key: string;
  heading: string;
  /** What this section is for, in the learner's terms. Shown always, not on
   * hover — a field whose purpose is only discoverable by hovering is a field
   * most people fill in wrong. */
  hint: string;
  register: UseFormRegisterReturn;
  error?: string;
  /** True when the generator left this section empty. Changes the placeholder
   * from "edit this" to "there's nothing here, add something if you like",
   * which are genuinely different invitations. */
  isEmpty: boolean;
};

interface SkaProfileCardProps {
  fields: SkaProfileField[];
  onSubmit: FormEventHandler<HTMLFormElement>;
  isSaving: boolean;
  /** ISO timestamp of the last review, or null while it has never been
   * reviewed — the only thing that decides whether this profile is in use. */
  reviewedAt: string | null;
  /** Set once a save succeeds in this session, so the button can acknowledge
   * the press rather than leaving the user wondering whether it took. */
  justSaved: boolean;
  saveError?: string;
}

const textareaClass =
  'w-full min-h-28 resize-y rounded-lg border border-border bg-body px-3 py-2 text-primary text-sm leading-relaxed placeholder:text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * The learner's SKA profile, as a reviewable and editable card.
 *
 * Presentational: the container owns the form instance, validation, and the
 * save mutation.
 *
 * The unreviewed banner is not decoration. A profile sits in the database
 * doing nothing until it is reviewed, and a learner looking at three filled-in
 * sections has every reason to assume it is already working — so the state has
 * to say, in words, that it is not in use and what activates it. Same rule as
 * every other gated surface in this app: never show a locked thing without
 * saying why it is locked and what unlocks it.
 */
export const SkaProfileCard = ({
  fields,
  onSubmit,
  isSaving,
  reviewedAt,
  justSaved,
  saveError,
}: SkaProfileCardProps) => (
  <form
    onSubmit={onSubmit}
    noValidate
    className="flex flex-col gap-4 rounded-container border border-border bg-card p-4"
  >
    <div className="flex flex-col gap-1">
      <h3 className="font-semibold text-primary text-sm">Your profile</h3>
      <p className="text-secondary text-sm leading-relaxed">
        Here's what I took from our conversation. Change anything I got wrong —
        it's yours, and it's what I'll keep in mind when we talk.
      </p>
    </div>

    {reviewedAt === null && (
      <p
        className="rounded-lg bg-warning-muted px-3 py-2 text-primary text-sm"
        // Not role="alert": nothing has gone wrong and this is present from
        // first render, so announcing it as an alert would interrupt a screen
        // reader user mid-sentence for a state that is simply the default.
      >
        Not in use yet — I won't refer to any of this until you save it below.
      </p>
    )}

    {fields.map((field) => (
      <div key={field.key} className="flex flex-col gap-1.5">
        <label
          htmlFor={`ska-${field.key}`}
          className="font-medium text-primary text-sm"
        >
          {field.heading}
        </label>
        <p id={`ska-${field.key}-hint`} className="text-tertiary text-xs">
          {field.hint}
        </p>
        <textarea
          {...field.register}
          id={`ska-${field.key}`}
          maxLength={SKA_SECTION_MAX_CHARS}
          placeholder={
            field.isEmpty
              ? "I couldn't fairly work this one out from what we covered — add anything you'd like me to know."
              : undefined
          }
          aria-invalid={field.error ? true : undefined}
          aria-describedby={
            field.error
              ? `ska-${field.key}-hint ska-${field.key}-error`
              : `ska-${field.key}-hint`
          }
          className={textareaClass}
        />
        {field.error && (
          <p
            id={`ska-${field.key}-error`}
            role="alert"
            className="text-error text-sm"
          >
            {field.error}
          </p>
        )}
      </div>
    ))}

    {saveError && (
      <p role="alert" className="text-error text-sm">
        {saveError}
      </p>
    )}

    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-on-accent text-sm disabled:opacity-60"
      >
        {isSaving && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {/* One button, and it saves whether or not anything was edited — a
            learner who agrees with all of it has reviewed it just as much as
            one who rewrote it. */}
        {reviewedAt === null ? 'Looks right, save' : 'Save changes'}
      </button>
      {/* <output> rather than a span with role="status": it carries the role
          implicitly and is announced politely, so a keyboard or screen-reader
          user hears that the save landed instead of only seeing it. */}
      {justSaved && !isSaving && (
        <output className="inline-flex items-center gap-1.5 text-secondary text-sm">
          <Check aria-hidden className="size-4" />
          Saved
        </output>
      )}
    </div>
  </form>
);
