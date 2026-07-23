import type {
  DragBindings,
  ResizeDir,
} from '#/components/chat-widget/use-chat-window-geometry';

interface ChatWidgetResizeHandlesProps {
  getHandleProps: (dir: ResizeDir) => DragBindings;
}

/** Eight invisible resize grips around the window border: four thin edge strips
 * (inset to leave room for corners) and four corner squares stacked above them.
 * Insets use logical properties (`inset-inline`/`inset-block`) via Tailwind
 * arbitrary properties so the layout mirrors correctly in RTL locales; the
 * strip thickness (`h-1.5`/`w-1.5`/`size-3`) is a fixed visual size and stays
 * physical, and the resize cursors stay physical (visual, not flow-relative). */
export function ChatWidgetResizeHandles({
  getHandleProps,
}: ChatWidgetResizeHandlesProps) {
  return (
    <>
      {/* Edges */}
      <div
        aria-hidden="true"
        {...getHandleProps('n')}
        className="absolute [inset-inline:0.75rem] [inset-block-start:0] h-1.5 cursor-ns-resize touch-none select-none"
      />
      <div
        aria-hidden="true"
        {...getHandleProps('s')}
        className="absolute [inset-inline:0.75rem] [inset-block-end:0] h-1.5 cursor-ns-resize touch-none select-none"
      />
      <div
        aria-hidden="true"
        {...getHandleProps('w')}
        className="absolute [inset-block:0.75rem] [inset-inline-start:0] w-1.5 cursor-ew-resize touch-none select-none"
      />
      <div
        aria-hidden="true"
        {...getHandleProps('e')}
        className="absolute [inset-block:0.75rem] [inset-inline-end:0] w-1.5 cursor-ew-resize touch-none select-none"
      />

      {/* Corners (above edges) */}
      <div
        aria-hidden="true"
        {...getHandleProps('nw')}
        className="absolute [inset-inline-start:0] [inset-block-start:0] z-10 size-3 cursor-nwse-resize touch-none select-none"
      />
      <div
        aria-hidden="true"
        {...getHandleProps('ne')}
        className="absolute [inset-inline-end:0] [inset-block-start:0] z-10 size-3 cursor-nesw-resize touch-none select-none"
      />
      <div
        aria-hidden="true"
        {...getHandleProps('sw')}
        className="absolute [inset-inline-start:0] [inset-block-end:0] z-10 size-3 cursor-nesw-resize touch-none select-none"
      />
      <div
        aria-hidden="true"
        {...getHandleProps('se')}
        className="absolute [inset-inline-end:0] [inset-block-end:0] z-10 size-3 cursor-nwse-resize touch-none select-none"
      />
    </>
  );
}
