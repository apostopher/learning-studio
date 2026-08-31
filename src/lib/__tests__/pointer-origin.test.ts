// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  focusedElementOrigin,
  installPointerOriginTracking,
  POINTER_X_PROPERTY,
  POINTER_Y_PROPERTY,
  publishPointerOrigin,
} from '#/lib/pointer-origin';

describe('publishPointerOrigin', () => {
  it('writes both coordinates as px on the element', () => {
    const el = document.createElement('div');

    publishPointerOrigin(el, 120, 340);

    // Asserting the UNIT, not just the number: `transform-origin`'s
    // `calc(var(--pointer-x) - 50vw + 50%)` is invalid with a unitless
    // value, so a bare `120` would silently disable the whole effect and
    // every dialog would scale from its own centre.
    expect(el.style.getPropertyValue(POINTER_X_PROPERTY)).toBe('120px');
    expect(el.style.getPropertyValue(POINTER_Y_PROPERTY)).toBe('340px');
  });

  it('keeps x and y on their own properties', () => {
    const el = document.createElement('div');

    publishPointerOrigin(el, 10, 900);

    // Mutant this catches: both writes targeting the same property (a
    // copy-paste), which would leave the vertical origin reading the
    // horizontal click.
    expect(el.style.getPropertyValue(POINTER_X_PROPERTY)).not.toBe(
      el.style.getPropertyValue(POINTER_Y_PROPERTY),
    );
  });
});

/** jsdom reports every rect as zero, so the box has to be stubbed. */
function elementWithRect(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('button');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 0, height: 0, ...rect }) as DOMRect;
  return el;
}

describe('focusedElementOrigin', () => {
  it('returns the centre of the focused control, not its corner', () => {
    const origin = focusedElementOrigin(
      elementWithRect({ left: 100, top: 200, width: 40, height: 20 }),
    );

    // Mutant this catches: returning `left`/`top`. A dialog would then grow
    // out of the button's top-left corner rather than the button.
    expect(origin).toEqual({ x: 120, y: 210 });
  });

  it('refuses an element with no box rather than reporting the screen corner', () => {
    // The failure this exists to prevent: `document.body` or a hidden element
    // reports 0×0 at 0,0, and every keyboard-opened dialog would fly in from
    // the top-left of the screen. Null lets the CSS fall back to the viewport
    // centre instead.
    expect(focusedElementOrigin(elementWithRect({}))).toBeNull();
  });

  it('accepts an element that is flat in one axis only', () => {
    // A zero-HEIGHT element still has a real horizontal position, so it is
    // not the corner case above. Mutant this catches: `width === 0 ||
    // height === 0`, which would throw away a usable origin.
    expect(
      focusedElementOrigin(
        elementWithRect({ left: 10, top: 50, width: 30, height: 0 }),
      ),
    ).toEqual({ x: 25, y: 50 });
  });

  it('returns null when nothing is focused', () => {
    expect(focusedElementOrigin(null)).toBeNull();
  });
});

function origin(): [string, string] {
  const root = document.documentElement;
  return [
    root.style.getPropertyValue(POINTER_X_PROPERTY),
    root.style.getPropertyValue(POINTER_Y_PROPERTY),
  ];
}

afterEach(() => {
  document.documentElement.style.removeProperty(POINTER_X_PROPERTY);
  document.documentElement.style.removeProperty(POINTER_Y_PROPERTY);
});

describe('installPointerOriginTracking', () => {
  it('publishes the pointer position on pointerdown', () => {
    const stop = installPointerOriginTracking(document);

    document.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 300, clientY: 120 }),
    );

    expect(origin()).toEqual(['300px', '120px']);
    stop();
  });

  it('listens in the CAPTURE phase, before the handler that opens the dialog', () => {
    // The load-bearing detail. A bubble-phase listener runs AFTER React's
    // click handler has already set the dialog's open state, so the popup
    // would paint its starting style from the PREVIOUS click's position —
    // every dialog animating out of wherever you clicked last time.
    const add = vi.spyOn(document, 'addEventListener');

    const stop = installPointerOriginTracking(document);

    const phases = add.mock.calls
      .filter(([type]) => type === 'pointerdown' || type === 'keydown')
      .map(([, , capture]) => capture);
    expect(phases).toEqual([true, true]);
    add.mockRestore();
    stop();
  });

  it('uses the focused control for a keyboard activation', () => {
    const stop = installPointerOriginTracking(document);
    const button = document.createElement('button');
    button.getBoundingClientRect = () =>
      ({ left: 40, top: 60, width: 20, height: 10 }) as DOMRect;
    document.body.appendChild(button);
    button.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(origin()).toEqual(['50px', '65px']);
    button.remove();
    stop();
  });

  it('ignores keys that do not activate a control', () => {
    const stop = installPointerOriginTracking(document);
    document.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 300, clientY: 120 }),
    );

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));

    // Mutant this catches: writing on every keydown. Tabbing away from a
    // button would move the origin to whatever was focused last, so the next
    // dialog would open from the wrong control.
    expect(origin()).toEqual(['300px', '120px']);
    stop();
  });

  it('leaves the origin alone when a keyboard activation has no usable focus', () => {
    const stop = installPointerOriginTracking(document);
    document.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 300, clientY: 120 }),
    );

    // `document.body` is focused here and reports a 0x0 box in jsdom.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Mutant this catches: publishing the origin unconditionally. It would
    // write 0,0 and the dialog would grow from the screen corner — worse
    // than keeping the last known point.
    expect(origin()).toEqual(['300px', '120px']);
    stop();
  });

  it('stops listening once torn down', () => {
    const stop = installPointerOriginTracking(document);
    stop();

    document.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 700, clientY: 800 }),
    );

    // Mutant this catches: an install that returns a no-op teardown. Every
    // remount would stack another listener on `document`, and none would
    // ever come off.
    expect(origin()).toEqual(['', '']);
  });
});
