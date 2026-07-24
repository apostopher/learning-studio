import { useCallback, useEffect, useRef } from 'react';

const MIN_HOLD_MS = 350;

export type CancelReason = 'short-press' | 'interrupt';

export interface PushToTalkBindings {
  ref: React.RefObject<HTMLButtonElement | null>;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export interface UsePushToTalkResult {
  bindings: PushToTalkBindings;
}

interface UsePushToTalkOptions {
  disabled: boolean;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onCancel: (reason: CancelReason) => void;
}

// Pure: a hold shorter than MIN_HOLD_MS is treated as an accidental tap and
// cancelled rather than sent. Extracted so this threshold check is testable
// without renderHook (see the test file for why renderHook is unavailable
// here).
export function isShortPress(elapsedMs: number): boolean {
  return elapsedMs < MIN_HOLD_MS;
}

// Pure: the keys that begin/end a push-to-talk hold via keyboard.
export function isActivationKey(key: string): boolean {
  return key === ' ' || key === 'Enter';
}

export function usePushToTalk({
  disabled,
  onHoldStart,
  onHoldEnd,
  onCancel,
}: UsePushToTalkOptions): UsePushToTalkResult {
  const ref = useRef<HTMLButtonElement | null>(null);
  const holdingRef = useRef(false);
  const pressStartRef = useRef(0);
  const keyHeldRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  const begin = useCallback(() => {
    if (disabled || holdingRef.current) return;
    holdingRef.current = true;
    pressStartRef.current = performance.now();
    onHoldStart();
  }, [disabled, onHoldStart]);

  // Release ends the hold from any pointer position — a hold shorter than
  // MIN_HOLD_MS is treated as an accidental tap and cancelled rather than sent.
  const end = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    detachRef.current?.();
    detachRef.current = null;
    pointerIdRef.current = null;
    const elapsed = performance.now() - pressStartRef.current;
    if (isShortPress(elapsed)) onCancel('short-press');
    else onHoldEnd();
  }, [onCancel, onHoldEnd]);

  const abort = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    detachRef.current?.();
    detachRef.current = null;
    pointerIdRef.current = null;
    onCancel('interrupt');
  }, [onCancel]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || holdingRef.current) return;
      e.preventDefault();
      // Capture the pointer so the release fires on this button even when the
      // pointer has moved far away — this is what makes "release anywhere" work.
      ref.current?.setPointerCapture(e.pointerId);
      pointerIdRef.current = e.pointerId;

      // Fallback release detection. On Windows a captured pointer's pointerup is
      // not reliably delivered to the button (capture is dropped when the pointer
      // leaves the window), so listen at the document level too. end() and
      // abort() are idempotent via holdingRef, so if the button's own onPointerUp
      // fires first, these no-op.
      const onDocPointerUp = (ev: PointerEvent) => {
        if (ev.pointerId === pointerIdRef.current) end();
      };
      const onDocPointerCancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerIdRef.current) abort();
      };
      // Pointer re-entered the window with no button pressed → it was released
      // outside the window; treat as a normal release.
      const onDocPointerMove = (ev: PointerEvent) => {
        if (ev.pointerId === pointerIdRef.current && ev.buttons === 0) end();
      };

      document.addEventListener('pointerup', onDocPointerUp);
      document.addEventListener('pointercancel', onDocPointerCancel);
      document.addEventListener('pointermove', onDocPointerMove);
      detachRef.current = () => {
        document.removeEventListener('pointerup', onDocPointerUp);
        document.removeEventListener('pointercancel', onDocPointerCancel);
        document.removeEventListener('pointermove', onDocPointerMove);
      };

      begin();
    },
    [disabled, begin, end, abort],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Escape') {
        abort();
        return;
      }
      if (isActivationKey(e.key) && !e.repeat && !keyHeldRef.current) {
        e.preventDefault();
        keyHeldRef.current = true;
        begin();
      }
    },
    [abort, begin],
  );

  const onKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (isActivationKey(e.key)) {
        keyHeldRef.current = false;
        end();
      }
    },
    [end],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Suppress the long-press context menu on touch devices during a hold.
      if (holdingRef.current) e.preventDefault();
    },
    [],
  );

  // Remove any live document/window listeners if we unmount mid-hold.
  useEffect(() => () => detachRef.current?.(), []);

  return {
    bindings: {
      ref,
      onPointerDown,
      onPointerUp: end,
      onPointerCancel: abort,
      onKeyDown,
      onKeyUp,
      onContextMenu,
    },
  };
}
