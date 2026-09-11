import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import type { CSSProperties, ReactNode, Ref } from 'react';

type Orientation = 'vertical' | 'horizontal' | 'both';

/**
 * Shuts off the axis this scroll area doesn't scroll, as an INLINE style.
 *
 * Base UI renders its Viewport with a hardcoded inline `overflow: scroll`, so
 * an `overflow-x`/`overflow-y` declaration in the stylesheet loses to it no
 * matter how specific the selector is — verified in the browser: the cross
 * axis computed to `scroll` with the stylesheet rule in place. That made every
 * single-axis scroll area a live scroll port on BOTH axes. The cross axis had
 * no scroll range, so a horizontal trackpad gesture over a column rubber-
 * banded the content sideways and (with `overscroll-behavior: contain`)
 * refused to hand the gesture up to the horizontal rail the columns sit in.
 *
 * Base UI merges the caller's `style` over its own, so this wins. The paired
 * half of the fix is `overscroll-behavior-inline/block: auto` in `styles.css`,
 * which lets the gesture chain to the rail; without it the axis would simply
 * be inert rather than deferring.
 *
 * Written as `clip`, though the browser computes it to `hidden` here — a box
 * that is a scroll container on one axis cannot truly clip the other. Either
 * way the axis stops responding to user scroll input, which is the point.
 *
 * Physical `overflowX`/`overflowY` rather than the logical `overflow-inline`/
 * `overflow-block`: those still lack the browser support this needs, and every
 * writing mode this app runs in maps inline to x.
 */
const crossAxisClip: Record<Orientation, CSSProperties> = {
  vertical: { overflowX: 'clip' },
  horizontal: { overflowY: 'clip' },
  both: {},
};

/**
 * Gives a HORIZONTALLY scrolling area's content a definite block size.
 *
 * Base UI's Content element carries one inline style, `min-width: fit-content`,
 * and no height at all — so its block size is its content's. That breaks the
 * percentage-height chain for everything inside a horizontal rail: measured in
 * the browser, the course rail's content box was 1211px tall inside a 400px
 * pane, so each column's `h-full` resolved against an auto height and
 * degenerated to auto, its own vertical ScrollArea got no constraint to shrink
 * into, and the viewport ended up exactly as tall as its lessons —
 * `scrollHeight === clientHeight`, a scroller that could never scroll. The
 * column simply grew and was clipped by the rail.
 *
 * `100%` here re-anchors that chain: content fills the viewport's block axis,
 * the columns get a real height to divide up, and their own scrollers engage.
 * Horizontal ONLY — a vertical area's content MUST be free to exceed the
 * viewport, which is the entire point of it, and `both` scrolls on both axes
 * for the same reason.
 *
 * Safe for a horizontal area whose root is deliberately auto-height (the
 * lesson-material tab strip, via `.lesson-material-tabs-scroll`): a percentage
 * against an auto-height parent resolves to auto, so the strip keeps its
 * content height. Verified in the browser alongside the two rails.
 *
 * Inline rather than in `styles.css` for the reason above it: this element's
 * geometry is set inline by Base UI, and the next version to add a height
 * there would beat a stylesheet rule silently.
 */
const contentBlockFill: Record<Orientation, CSSProperties> = {
  vertical: {},
  horizontal: { blockSize: '100%' },
  both: {},
};

type ScrollAreaProps = {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  orientation?: Orientation;
  /** Ref to the scrolling viewport element — e.g. for `use-stick-to-bottom`,
   * which needs to read/set scrollTop on the actual scroll container. */
  viewportRef?: Ref<HTMLDivElement>;
};

export const ScrollArea = ({
  children,
  className,
  viewportClassName,
  orientation = 'vertical',
  viewportRef,
}: ScrollAreaProps) => {
  const showVertical = orientation !== 'horizontal';
  const showHorizontal = orientation !== 'vertical';

  return (
    <BaseScrollArea.Root
      className={
        className ? `scroll-area-root ${className}` : 'scroll-area-root'
      }
    >
      <BaseScrollArea.Viewport
        ref={viewportRef}
        data-orientation={orientation}
        style={crossAxisClip[orientation]}
        className={
          viewportClassName
            ? `scroll-area-viewport ${viewportClassName}`
            : 'scroll-area-viewport'
        }
      >
        <BaseScrollArea.Content
          className="scroll-area-content"
          style={{ minWidth: '0', ...contentBlockFill[orientation] }}
        >
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      {showVertical ? (
        <BaseScrollArea.Scrollbar
          orientation="vertical"
          keepMounted
          className="scroll-area-scrollbar"
        >
          <BaseScrollArea.Thumb className="scroll-area-thumb" />
        </BaseScrollArea.Scrollbar>
      ) : null}
      {showHorizontal ? (
        <BaseScrollArea.Scrollbar
          orientation="horizontal"
          keepMounted
          className="scroll-area-scrollbar"
        >
          <BaseScrollArea.Thumb className="scroll-area-thumb" />
        </BaseScrollArea.Scrollbar>
      ) : null}
      {orientation === 'both' ? (
        <BaseScrollArea.Corner className="scroll-area-corner" />
      ) : null}
    </BaseScrollArea.Root>
  );
};
