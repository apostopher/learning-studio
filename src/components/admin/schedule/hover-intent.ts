/**
 * Hover timing for the offering preview.
 *
 * Open delay: sweeping the mouse across a busy calendar must not flash a
 * popover over every bar it crosses. Close grace: every DAY of an offering is
 * its own button, so moving along one bar is a leave + enter per day; without
 * the grace the preview would blink at each day boundary.
 *
 * Mouse only. Touch fires pointerenter before its click, and a preview the
 * finger can never move away from is noise — a tap pins instead. Pen is
 * treated like touch for the same reason.
 *
 * Timers are injectable so tests drive them with fake timers and so nothing
 * here touches React.
 */
export const HOVER_OPEN_DELAY_MS = 300;
export const HOVER_CLOSE_GRACE_MS = 120;

export type HoverIntent = {
  enter: (offeringId: number, pointerType: string, isPreviewing: boolean) => void;
  leave: (offeringId: number, pointerType: string) => void;
  cancel: () => void;
};

export function createHoverIntent({
  onOpen,
  onClose,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}: {
  onOpen: (offeringId: number) => void;
  onClose: (offeringId: number) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}): HoverIntent {
  let openTimer: unknown = null;
  let closeTimer: unknown = null;
  const clearOpen = () => {
    if (openTimer !== null) clearTimer(openTimer);
    openTimer = null;
  };
  const clearClose = () => {
    if (closeTimer !== null) clearTimer(closeTimer);
    closeTimer = null;
  };

  return {
    enter(offeringId, pointerType, isPreviewing) {
      if (pointerType !== 'mouse') return;
      clearClose();
      clearOpen();
      // Already showing a preview: the user has shown intent, so moving to a
      // neighbouring bar answers at once, the way tooltip groups behave.
      if (isPreviewing) {
        onOpen(offeringId);
        return;
      }
      openTimer = setTimer(() => {
        openTimer = null;
        onOpen(offeringId);
      }, HOVER_OPEN_DELAY_MS);
    },
    leave(offeringId, pointerType) {
      if (pointerType !== 'mouse') return;
      clearOpen();
      clearClose();
      closeTimer = setTimer(() => {
        closeTimer = null;
        onClose(offeringId);
      }, HOVER_CLOSE_GRACE_MS);
    },
    cancel() {
      clearOpen();
      clearClose();
    },
  };
}
