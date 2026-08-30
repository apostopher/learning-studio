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
 */
export const DragRefusalNote = ({ reason }: { reason: string }) => (
  <p className="mt-2 max-w-80 rounded-md border border-error-9/40 bg-error-9/15 px-2.5 py-1.5 text-error-text text-xs leading-snug">
    {reason}
  </p>
);
