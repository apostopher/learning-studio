/**
 * Where the last click landed, in viewport pixels, published as CSS custom
 * properties on `<html>`.
 *
 * Dialogs read these to set their `transform-origin`, so a modal grows out of
 * the control that opened it rather than materialising in the middle of the
 * screen. That connection is the whole point: it tells the eye where the new
 * surface came from, which is the difference between a dialog appearing and a
 * dialog interrupting.
 *
 * Published as CSS variables rather than React state on purpose. Every dialog
 * in the app can read them without a provider, a prop, or a re-render — and
 * the write happens on `pointerdown`, well before the click that opens the
 * dialog has even fired, so the value is always in place before the popup's
 * starting style is painted.
 */
export const POINTER_X_PROPERTY = '--pointer-x';
export const POINTER_Y_PROPERTY = '--pointer-y';

/**
 * Publish an origin point. Coordinates are viewport-relative (`clientX`/
 * `clientY`), which is the space `transform-origin`'s `vw`/`vh` arithmetic
 * needs — see `.dialog-popup` in `styles.css`.
 */
export function publishPointerOrigin(
  element: HTMLElement,
  x: number,
  y: number,
): void {
  element.style.setProperty(POINTER_X_PROPERTY, `${x}px`);
  element.style.setProperty(POINTER_Y_PROPERTY, `${y}px`);
}

/**
 * The origin for a keyboard activation: the centre of the focused control.
 *
 * A keyboard `click` reports `clientX`/`clientY` of `0`, which without this
 * would grow every dialog out of the top-left corner of the screen. Returns
 * null when there is no usable focused element, and the CSS falls back to the
 * viewport centre — a plain scale from the middle, which is the honest answer
 * when no origin is known.
 */
export function focusedElementOrigin(
  active: Element | null,
): { x: number; y: number } | null {
  if (!(active instanceof HTMLElement)) return null;
  const rect = active.getBoundingClientRect();
  // A focused element with no box (display:none, or the body itself) would
  // report 0×0 at 0,0 — the very corner this function exists to avoid.
  if (rect.width === 0 && rect.height === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Wire up origin tracking on a document, returning the teardown.
 *
 * A plain function rather than the body of the component's effect, for two
 * reasons. It is testable — this repo's components cannot be rendered under
 * vitest at all (react-compiler nulls the hook dispatcher), so behaviour left
 * inside an effect is behaviour no test can reach. And it takes its document
 * as an argument, so a test drives a real one instead of reaching for a
 * global.
 *
 * Both listeners are registered in the CAPTURE phase. That is load-bearing:
 * they must run before the React click handler that opens the dialog, or the
 * popup mounts and paints its starting style from the PREVIOUS click's
 * position — every dialog growing out of wherever you clicked last time.
 */
export function installPointerOriginTracking(doc: Document): () => void {
  const root = doc.documentElement;

  const onPointerDown = (event: Event) => {
    const { clientX, clientY } = event as PointerEvent;
    publishPointerOrigin(root, clientX, clientY);
  };

  const onKeyDown = (event: Event) => {
    const { key } = event as KeyboardEvent;
    // The two keys that activate a button. A keyboard `click` carries
    // coordinates of 0,0, so without this branch every keyboard-opened
    // dialog would fly in from the top-left corner of the screen.
    if (key !== 'Enter' && key !== ' ') return;
    const origin = focusedElementOrigin(doc.activeElement);
    if (origin) publishPointerOrigin(root, origin.x, origin.y);
  };

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKeyDown, true);
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown, true);
  };
}
