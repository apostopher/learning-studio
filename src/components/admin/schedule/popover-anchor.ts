/**
 * Where the offering popover points.
 *
 * `cursor` is stored as an offset INSIDE the hovered segment, not as raw
 * viewport coordinates: the calendar scrolls, and a pinned popover anchored to
 * a viewport point would stay put while the bar it describes slid away.
 * `element` is for keyboard (no pointer position exists); `rect` is the day a
 * course was dropped on, captured once at drop time.
 */
export type PopoverAnchor =
  | { kind: 'cursor'; element: Element; offsetX: number; offsetY: number }
  | { kind: 'element'; element: Element }
  | { kind: 'rect'; left: number; top: number; width: number; height: number };

export type VirtualAnchor = {
  getBoundingClientRect: () => DOMRect;
  contextElement?: Element;
};

export function toVirtualElement(anchor: PopoverAnchor): VirtualAnchor {
  switch (anchor.kind) {
    case 'cursor':
      return {
        contextElement: anchor.element,
        getBoundingClientRect: () => {
          const box = anchor.element.getBoundingClientRect();
          return new DOMRect(box.left + anchor.offsetX, box.top + anchor.offsetY, 0, 0);
        },
      };
    case 'element':
      return {
        contextElement: anchor.element,
        getBoundingClientRect: () => anchor.element.getBoundingClientRect(),
      };
    case 'rect':
      return {
        getBoundingClientRect: () =>
          new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height),
      };
  }
}

/**
 * A keyboard-activated click (Enter/Space on the segment) reports `detail` 0
 * and coordinates (0, 0) — anchoring to that would throw the popover into
 * the top-left corner. Those anchor to the segment itself.
 */
export function anchorFromPointerEvent(
  element: Element,
  event: { clientX: number; clientY: number; detail?: number },
): PopoverAnchor {
  if (event.detail === 0) return { kind: 'element', element };
  const box = element.getBoundingClientRect();
  return {
    kind: 'cursor',
    element,
    offsetX: event.clientX - box.left,
    offsetY: event.clientY - box.top,
  };
}
