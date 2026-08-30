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
  ariaValueMin = 0,
  ariaValueMax = 100,
}: {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  ariaValueNow: number;
  /**
   * The range the splitter can actually reach. The container owns the clamp,
   * so it owns these too: hardcoding 0–100 here announced a range the control
   * refuses to move to, which is worse than announcing nothing — a screen
   * reader user would hear the handle stop responding well before "0".
   */
  ariaValueMin?: number;
  ariaValueMax?: number;
}) => (
  // biome-ignore lint/a11y/useSemanticElements: <hr> doesn't accept tabindex/keyboard handlers; role=separator with explicit aria-orientation/valuenow is the WAI-ARIA pattern for a draggable splitter
  <div
    role="separator"
    aria-label="Resize the library and course panes"
    aria-orientation="vertical"
    aria-valuenow={ariaValueNow}
    aria-valuemin={ariaValueMin}
    aria-valuemax={ariaValueMax}
    tabIndex={0}
    onPointerDown={onPointerDown}
    className="group relative w-1.5 shrink-0 cursor-col-resize touch-none bg-gray-6 transition-colors hover:bg-apple-9 focus-visible:bg-apple-9 focus-visible:outline-none"
  />
);
