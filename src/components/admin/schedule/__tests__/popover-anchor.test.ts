// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { anchorFromPointerEvent, toVirtualElement } from '../popover-anchor';

const el = (left: number, top: number) =>
  ({
    getBoundingClientRect: () => new DOMRect(left, top, 40, 20),
  }) as unknown as Element;

describe('popover anchor', () => {
  it('a cursor anchor is a zero-size rect at the cursor, tracking its element', () => {
    const element = el(100, 200);
    const anchor = anchorFromPointerEvent(element, { clientX: 130, clientY: 205, detail: 1 });
    expect(anchor).toEqual({ kind: 'cursor', element, offsetX: 30, offsetY: 5 });
    const rect = toVirtualElement(anchor).getBoundingClientRect();
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([130, 205, 0, 0]);
  });

  it('follows the element when it scrolls (offset is relative)', () => {
    let top = 200;
    const element = { getBoundingClientRect: () => new DOMRect(100, top, 40, 20) } as unknown as Element;
    const v = toVirtualElement({ kind: 'cursor', element, offsetX: 30, offsetY: 5 });
    top = 150;
    expect(v.getBoundingClientRect().y).toBe(155);
  });

  it('keyboard click (detail 0) anchors to the element', () => {
    const element = el(100, 200);
    expect(anchorFromPointerEvent(element, { clientX: 0, clientY: 0, detail: 0 })).toEqual({
      kind: 'element',
      element,
    });
  });

  it('a rect anchor is fixed', () => {
    const r = toVirtualElement({ kind: 'rect', left: 1, top: 2, width: 3, height: 4 }).getBoundingClientRect();
    expect([r.x, r.y, r.width, r.height]).toEqual([1, 2, 3, 4]);
  });
});
