import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { inlineDirSign } from '#/lib/inline-direction';

const FALLBACK_MIN = 300;
const FALLBACK_MAX = 400;
const KEYBOARD_STEP = 8;

const isBrowser = () => typeof document !== 'undefined';

const readPxVar = (name: string, fallback: number): number => {
  if (!isBrowser()) return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
};

const getCurrentWidth = () => readPxVar('--sidebar-width', FALLBACK_MIN);
const getMin = () => readPxVar('--sidebar-width-min', FALLBACK_MIN);
const getMax = () => readPxVar('--sidebar-width-max', FALLBACK_MAX);

const writeWidth = (next: number, target: HTMLElement) => {
  const min = getMin();
  const max = getMax();
  const clamped = Math.min(max, Math.max(min, next));
  document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`);
  target.setAttribute('aria-valuenow', String(clamped));
  return clamped;
};

const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
  if (event.button !== 0) return;
  const target = event.currentTarget;
  target.setPointerCapture(event.pointerId);
  target.dataset.dragging = 'true';
  // Track width independently of pointer X so we can drag past the handle's
  // own viewport position without the cursor "snapping back" to it.
  let width = getCurrentWidth();
  let lastX = event.clientX;

  const handleMove = (ev: PointerEvent) => {
    // dx is viewport-physical (clientX is always left-to-right). Multiply
    // by inlineDirSign() so the logical "grow" direction matches whichever
    // edge the sidebar lives on: in LTR moving the pointer right grows the
    // aside; in RTL moving it left grows the aside.
    const dx = (ev.clientX - lastX) * inlineDirSign();
    lastX = ev.clientX;
    width = writeWidth(width + dx, target);
  };
  const handleUp = (ev: PointerEvent) => {
    target.releasePointerCapture(ev.pointerId);
    target.removeEventListener('pointermove', handleMove);
    target.removeEventListener('pointerup', handleUp);
    target.removeEventListener('pointercancel', handleUp);
    delete target.dataset.dragging;
  };

  target.addEventListener('pointermove', handleMove);
  target.addEventListener('pointerup', handleUp);
  target.addEventListener('pointercancel', handleUp);
};

const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  const key = event.key;
  const target = event.currentTarget;
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    event.preventDefault();
    // Map physical arrow keys to logical inline-start/inline-end. In LTR,
    // ArrowLeft moves toward inline-start (shrink); in RTL it moves toward
    // inline-end (grow). Sign-flip via inlineDirSign so the user always
    // shrinks toward the page edge and grows toward the content.
    const physicalDelta = key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP;
    const logicalDelta = physicalDelta * inlineDirSign();
    writeWidth(getCurrentWidth() + logicalDelta, target);
    return;
  }
  if (key === 'Enter') {
    event.preventDefault();
    const stored = target.dataset.collapsedFrom;
    if (stored) {
      writeWidth(parseInt(stored, 10), target);
      delete target.dataset.collapsedFrom;
    } else {
      target.dataset.collapsedFrom = String(getCurrentWidth());
      writeWidth(getMin(), target);
    }
  }
};

type Props = {
  controlledAsideId?: string;
};

export const ResizeHandle = ({ controlledAsideId }: Props) => (
  // biome-ignore lint/a11y/useSemanticElements: <hr> doesn't accept tabindex/keyboard handlers; role=separator with explicit aria-orientation/valuemin/max/now is the WAI-ARIA pattern for a draggable splitter
  <div
    className="resize-handle"
    role="separator"
    tabIndex={0}
    aria-label="Resize sidebar"
    aria-orientation="vertical"
    aria-valuemin={isBrowser() ? getMin() : FALLBACK_MIN}
    aria-valuemax={isBrowser() ? getMax() : FALLBACK_MAX}
    aria-valuenow={isBrowser() ? getCurrentWidth() : FALLBACK_MIN}
    aria-controls={controlledAsideId}
    onPointerDown={handlePointerDown}
    onKeyDown={handleKeyDown}
  />
);
