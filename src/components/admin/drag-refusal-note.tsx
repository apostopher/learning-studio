/**
 * Why this component exists:
 * - Checked: no Base UI component renders a static, non-interactive notice.
 *   The nearest, Toast, is a queued transient surface — it cannot be rendered
 *   inside a `DragOverlay`, which is what puts this note under the cursor.
 * - Checked: cannot compose an existing component — `AlertBar` is the fixed
 *   strip at the top of every authed screen, not a free-floating note.
 *
 * The sentence a refused drag shows, pinned beneath the dragged card so it is
 * where the admin is already looking. A drag that silently springs back reads
 * as broken software; this is the visible half of saying why. The same
 * sentence reaches screen readers through the editor's DndContext
 * announcements, and becomes a toast if the drop actually happens.
 *
 * **Nearly opaque, over a heavy blur, and that pairing is the whole fix.**
 * This note floats over whatever the drag happens to be crossing — poster
 * thumbnails, chips, other cards — and its first version was a 15% error tint,
 * which left the text sitting on top of all of it and frequently unreadable.
 * The blur is what removes the HIGH-FREQUENCY contrast underneath: it smears
 * the board into a near-uniform field, so the remaining tint shifts the
 * background predictably instead of putting a letterform over the edge of a
 * photograph. The 90% fill is what keeps that shift small enough for
 * `error-text` to hold its designed contrast against `gray-1` — legibility is
 * not something this codebase trades for the frosted look, so the two are
 * tuned together rather than one at the other's expense.
 *
 * The error identity moved to the BORDER for the same reason: an error-tinted
 * fill and a legible fill are competing for the same surface, and the border
 * carries the meaning at no cost to the text.
 */
export const DragRefusalNote = ({ reason }: { reason: string }) => (
  <p className="mt-2 max-w-80 rounded-md border border-error-9/50 bg-gray-1/90 px-2.5 py-1.5 text-error-text text-xs leading-snug shadow-lg backdrop-blur-2xl">
    {reason}
  </p>
);
