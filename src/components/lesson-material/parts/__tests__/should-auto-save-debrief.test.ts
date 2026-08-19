import { describe, expect, it } from 'vitest';
import { shouldAutoSaveDebrief } from '../should-auto-save-debrief';

describe('shouldAutoSaveDebrief', () => {
  it('saves a freshly completed attempt', () => {
    expect(
      shouldAutoSaveDebrief({
        isComplete: true,
        alreadySaved: false,
        readOnly: false,
      }),
    ).toBe(true);
  });

  it('does not save an incomplete attempt', () => {
    expect(
      shouldAutoSaveDebrief({
        isComplete: false,
        alreadySaved: false,
        readOnly: false,
      }),
    ).toBe(false);
  });

  it('does not save a second time', () => {
    expect(
      shouldAutoSaveDebrief({
        isComplete: true,
        alreadySaved: true,
        readOnly: false,
      }),
    ).toBe(false);
  });

  // The load-bearing case: a debrief regenerated on a lesson that has since
  // gone read-only must never have this effect POST a save.
  it('never saves in read-only mode, even when complete and unsaved', () => {
    expect(
      shouldAutoSaveDebrief({
        isComplete: true,
        alreadySaved: false,
        readOnly: true,
      }),
    ).toBe(false);
  });
});
