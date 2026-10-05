import { describe, expect, it } from 'vitest';
import {
  CLOSED,
  type OfferingPopoverState,
  reduceOfferingPopover as r,
} from '../offering-popover-state';

const edit7 = { mode: 'edit', offeringId: 7 } as const;
const pinned7: OfferingPopoverState = {
  status: 'pinned',
  target: edit7,
  confirmingDiscard: false,
};

describe('reduceOfferingPopover', () => {
  it('opens a preview from closed', () => {
    expect(r(CLOSED, { type: 'preview', offeringId: 7 })).toEqual({
      status: 'preview',
      offeringId: 7,
    });
  });

  it('switches preview straight to another offering', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'preview', offeringId: 9 })).toEqual({
      status: 'preview',
      offeringId: 9,
    });
  });

  it('leave closes only the offering being previewed', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'leave', offeringId: 9 })).toBe(s);
    expect(r(s, { type: 'leave', offeringId: 7 })).toEqual(CLOSED);
  });

  it('pins from preview and from closed', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'pin', target: edit7 })).toEqual(pinned7);
    expect(r(CLOSED, { type: 'pin', target: edit7 })).toEqual(pinned7);
  });

  it('ignores hover and leave while pinned', () => {
    expect(r(pinned7, { type: 'preview', offeringId: 9 })).toBe(pinned7);
    expect(r(pinned7, { type: 'leave', offeringId: 7 })).toBe(pinned7);
  });

  it('pin while pinned is ignored (a dirty confirm must not be swapped out)', () => {
    const confirming = { ...pinned7, confirmingDiscard: true };
    expect(
      r(confirming, { type: 'pin', target: { mode: 'edit', offeringId: 9 } }),
    ).toBe(confirming);
  });

  it('dismiss from outside-press while previewing is ignored', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'dismiss', reason: 'outside', dirty: false })).toBe(s);
  });

  it('escape closes a preview', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'dismiss', reason: 'escape', dirty: false })).toEqual(
      CLOSED,
    );
  });

  it('clean dismiss closes a pinned popover', () => {
    expect(
      r(pinned7, { type: 'dismiss', reason: 'outside', dirty: false }),
    ).toEqual(CLOSED);
  });

  it('dirty dismiss asks first, keepEditing withdraws the question', () => {
    const asking = r(pinned7, { type: 'dismiss', reason: 'escape', dirty: true });
    expect(asking).toEqual({ ...pinned7, confirmingDiscard: true });
    expect(r(asking, { type: 'keepEditing' })).toEqual(pinned7);
  });

  it('close always closes', () => {
    expect(r({ ...pinned7, confirmingDiscard: true }, { type: 'close' })).toEqual(
      CLOSED,
    );
  });
});
