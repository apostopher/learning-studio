/**
 * Asked when a pinned offering with unsaved edits is dismissed by Esc or a
 * click outside. Inline rather than a nested dialog: it is a question ABOUT
 * this popover, so it lives in the popover's footer where the buttons it
 * replaces were.
 *
 * `autoFocus` on "Keep editing" — the safe answer takes focus, so a second
 * stray Esc or Enter cannot throw the work away.
 */
export const OfferingDiscardConfirm = ({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) => (
  <fieldset
    aria-labelledby="offering-discard-question"
    className="flex flex-wrap items-center gap-2 rounded-lg border border-error-7 bg-error-3 px-3 py-2"
  >
    <p
      id="offering-discard-question"
      className="me-auto text-error-text text-sm"
    >
      You have unsaved changes to this offering.
    </p>
    <button
      type="button"
      // biome-ignore lint/a11y/noAutofocus: the safe choice must take focus — see doc comment
      autoFocus
      onClick={onKeepEditing}
      className="rounded-lg border border-gray-6 bg-gray-2 px-3 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
    >
      Keep editing
    </button>
    <button
      type="button"
      onClick={onDiscard}
      className="rounded-lg px-3 py-1.5 font-medium text-error-text text-sm transition-colors hover:bg-error-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9"
    >
      Discard changes
    </button>
  </fieldset>
);
