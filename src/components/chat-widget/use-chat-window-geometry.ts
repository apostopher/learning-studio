import { useAtom } from 'jotai';
import {
  animate,
  type MotionValue,
  useMotionValue,
  useReducedMotion,
} from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { type ChatWindowRect, chatWidgetRectAtom } from '#/atoms/chat-widget';

export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 360;
export const DEFAULT_WIDTH = 400;
export const MARGIN = 24;

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface Viewport {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  // max can fall below min in tiny viewports; bias toward min so the window
  // never inverts.
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

export function computeDefaultHeight(vp: Viewport): number {
  return Math.min(560, Math.round(0.7 * vp.height));
}

/** Default rect: default size (viewport-capped) anchored to the bottom-right. */
export function computeDefaultRect(vp: Viewport): ChatWindowRect {
  const width = Math.min(DEFAULT_WIDTH, vp.width - 2 * MARGIN);
  const height = Math.min(computeDefaultHeight(vp), vp.height - 2 * MARGIN);
  return {
    width,
    height,
    left: vp.width - MARGIN - width,
    top: vp.height - MARGIN - height,
  };
}

/** Edge-based resize: pinned edges stay, moving edges move, each clamped once
 * against the min-size floor and the viewport margin simultaneously. */
export function computeResize(
  dir: ResizeDir,
  start: ChatWindowRect,
  delta: { dx: number; dy: number },
  vp: Viewport,
): ChatWindowRect {
  let left = start.left;
  let top = start.top;
  let right = start.left + start.width;
  let bottom = start.top + start.height;

  if (dir.includes('e'))
    right = clamp(right + delta.dx, left + MIN_WIDTH, vp.width - MARGIN);
  if (dir.includes('w'))
    left = clamp(left + delta.dx, MARGIN, right - MIN_WIDTH);
  if (dir.includes('s'))
    bottom = clamp(bottom + delta.dy, top + MIN_HEIGHT, vp.height - MARGIN);
  if (dir.includes('n'))
    top = clamp(top + delta.dy, MARGIN, bottom - MIN_HEIGHT);

  return { left, top, width: right - left, height: bottom - top };
}

/** Clamp a rect's position so all four edges stay within the viewport margins,
 * without changing its size. */
export function clampPosition(
  rect: ChatWindowRect,
  vp: Viewport,
): { left: number; top: number } {
  const maxLeft = Math.max(MARGIN, vp.width - MARGIN - rect.width);
  const maxTop = Math.max(MARGIN, vp.height - MARGIN - rect.height);
  return {
    left: clamp(rect.left, MARGIN, maxLeft),
    top: clamp(rect.top, MARGIN, maxTop),
  };
}

/** Clamp a rect to fit the viewport: size first (so width/height can't exceed
 * the viewport minus margins, floored at the min size), then position (so all
 * edges stay on-screen). Used to reconcile a persisted or stale rect against
 * the current viewport on load and on window resize. */
export function reconcileToViewport(
  rect: ChatWindowRect,
  vp: Viewport,
): ChatWindowRect {
  const width = clamp(
    rect.width,
    MIN_WIDTH,
    Math.max(MIN_WIDTH, vp.width - 2 * MARGIN),
  );
  const height = clamp(
    rect.height,
    MIN_HEIGHT,
    Math.max(MIN_HEIGHT, vp.height - 2 * MARGIN),
  );
  const { left, top } = clampPosition({ ...rect, width, height }, vp);
  return { left, top, width, height };
}

export interface DragBindings {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

export interface UseChatWindowGeometry {
  left: MotionValue<number>;
  top: MotionValue<number>;
  width: MotionValue<number>;
  height: MotionValue<number>;
  isDirty: boolean;
  reset: () => void;
  dragBindings: DragBindings;
  getResizeHandleProps: (dir: ResizeDir) => DragBindings;
}

interface Gesture {
  mode: 'drag' | 'resize';
  dir?: ResizeDir;
  pointer: { x: number; y: number };
  start: ChatWindowRect;
  moved: boolean;
}

function getViewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useChatWindowGeometry(): UseChatWindowGeometry {
  const [rect, setRect] = useAtom(chatWidgetRectAtom);
  const reducedMotion = useReducedMotion() ?? false;

  const left = useMotionValue(rect?.left ?? 0);
  const top = useMotionValue(rect?.top ?? 0);
  const width = useMotionValue(rect?.width ?? DEFAULT_WIDTH);
  const height = useMotionValue(rect?.height ?? MIN_HEIGHT);

  const gestureRef = useRef<Gesture | null>(null);

  const currentRect = useCallback(
    (): ChatWindowRect => ({
      left: left.get(),
      top: top.get(),
      width: width.get(),
      height: height.get(),
    }),
    [left, top, width, height],
  );

  const applyRect = useCallback(
    (r: ChatWindowRect) => {
      left.set(r.left);
      top.set(r.top);
      width.set(r.width);
      height.set(r.height);
    },
    [left, top, width, height],
  );

  const stopAnimations = useCallback(() => {
    left.stop();
    top.stop();
    width.stop();
    height.stop();
  }, [left, top, width, height]);

  // Seed / resync the motion values whenever the atom changes and no gesture is
  // in progress. A persisted rect is reconciled to the current viewport so a
  // rect saved on a larger screen never reopens off-screen. useLayoutEffect runs
  // before paint, so the first mount places the window with no visible flash.
  // Invariant: `rect` only changes on a committed gesture or reset-complete, so
  // this effect cannot fire mid-reset-spring and clobber it.
  useLayoutEffect(() => {
    if (gestureRef.current) return;
    applyRect(
      rect
        ? reconcileToViewport(rect, getViewport())
        : computeDefaultRect(getViewport()),
    );
  }, [rect, applyRect]);

  // Re-reconcile to the viewport when the browser window resizes (or zooms)
  // while the chat window is open, so it can never be left stranded off-screen.
  // Does not persist — only the motion values are updated, so restoring the
  // viewport restores the saved rect.
  useEffect(() => {
    const onResize = () => {
      if (gestureRef.current) return;
      applyRect(
        rect
          ? reconcileToViewport(rect, getViewport())
          : computeDefaultRect(getViewport()),
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [rect, applyRect]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gestureRef.current;
      if (!g) return;
      const delta = {
        dx: e.clientX - g.pointer.x,
        dy: e.clientY - g.pointer.y,
      };
      if (delta.dx !== 0 || delta.dy !== 0) g.moved = true;
      const vp = getViewport();
      if (g.mode === 'drag') {
        const moved = {
          ...g.start,
          left: g.start.left + delta.dx,
          top: g.start.top + delta.dy,
        };
        const { left: L, top: T } = clampPosition(moved, vp);
        left.set(L);
        top.set(T);
      } else if (g.dir) {
        applyRect(computeResize(g.dir, g.start, delta, vp));
      }
    },
    [left, top, applyRect],
  );

  const endGesture = useCallback(() => {
    const g = gestureRef.current;
    if (!g) return;
    gestureRef.current = null;
    if (g.moved) setRect(currentRect());
  }, [setRect, currentRect]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      // Let clicks on the control buttons through without starting a drag.
      if ((e.target as HTMLElement).closest('button')) return;
      stopAnimations();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      gestureRef.current = {
        mode: 'drag',
        pointer: { x: e.clientX, y: e.clientY },
        start: currentRect(),
        moved: false,
      };
    },
    [currentRect, stopAnimations],
  );

  const startResize = useCallback(
    (e: React.PointerEvent, dir: ResizeDir) => {
      e.preventDefault();
      e.stopPropagation();
      stopAnimations();
      e.currentTarget.setPointerCapture(e.pointerId);
      gestureRef.current = {
        mode: 'resize',
        dir,
        pointer: { x: e.clientX, y: e.clientY },
        start: currentRect(),
        moved: false,
      };
    },
    [currentRect, stopAnimations],
  );

  const reset = useCallback(() => {
    const target = computeDefaultRect(getViewport());
    if (reducedMotion) {
      applyRect(target);
      setRect(null);
      return;
    }
    const spring = { type: 'spring', bounce: 0.2, duration: 0.4 } as const;
    animate(left, target.left, spring);
    animate(top, target.top, spring);
    animate(width, target.width, spring);
    animate(height, target.height, {
      ...spring,
      onComplete: () => setRect(null),
    });
  }, [reducedMotion, applyRect, setRect, left, top, width, height]);

  const dragBindings: DragBindings = {
    onPointerDown: startDrag,
    onPointerMove,
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
  };

  const getResizeHandleProps = useCallback(
    (dir: ResizeDir): DragBindings => ({
      onPointerDown: (e) => startResize(e, dir),
      onPointerMove,
      onPointerUp: endGesture,
      onPointerCancel: endGesture,
    }),
    [startResize, onPointerMove, endGesture],
  );

  return {
    left,
    top,
    width,
    height,
    isDirty: rect !== null,
    reset,
    dragBindings,
    getResizeHandleProps,
  };
}
