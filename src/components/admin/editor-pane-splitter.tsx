import type { PointerEventHandler } from 'react';

/**
 * Why this component exists:
 * - Checked: no Base UI primitive is a plain draggable pane divider (Base UI
 *   ships no "Resizable"/"Splitter" component in this codebase's version).
 * - Checked: cannot compose an existing component — this is a single static
 *   element whose only job is to relay a pointerdown to its caller.
 *
 * The draggable divider between the library pane and the course rail. It
 * owns no position state itself — the container that tracks the split
 * position and reacts to the drag is a later task — so this stays a pure,
 * stateless separator.
 *
 * `role="separator"` with an explicit `tabIndex` is the WAI-ARIA pattern for
 * a draggable splitter: a divider that only responds to a mouse is unusable
 * for anyone who cannot use one, so it must be focusable and reachable by
 * keyboard even before the later task wires up arrow-key resizing.
 */
export const EditorPaneSplitter = ({
  onPointerDown,
  ariaValueNow,
}: {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  ariaValueNow: number;
}) => (
  // biome-ignore lint/a11y/useSemanticElements: <hr> doesn't accept tabindex/keyboard handlers; role=separator with explicit aria-orientation/valuenow is the WAI-ARIA pattern for a draggable splitter
  <div
    role="separator"
    aria-label="Resize the library and course panes"
    aria-orientation="vertical"
    aria-valuenow={ariaValueNow}
    aria-valuemin={0}
    aria-valuemax={100}
    tabIndex={0}
    onPointerDown={onPointerDown}
    className="group relative w-1.5 shrink-0 cursor-col-resize touch-none bg-gray-6 transition-colors hover:bg-apple-9 focus-visible:bg-apple-9 focus-visible:outline-none"
  />
);
