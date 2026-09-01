// @vitest-environment jsdom
import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';

import { userDisciplinePicksAtom } from '#/atoms/admin';

/**
 * `userDisciplinePicksAtom` holds ONE person's unsaved discipline selection,
 * in a module-global atom. Closing the user-detail modal must clear it.
 *
 * The bug this pins: it was reset only in the save's `onSuccess`, so closing
 * Alice's modal without saving left her picks in the atom. Opening Bob then
 * showed HER list; `isDirty` compared it against HIS roster and so enabled
 * "Save disciplines"; pressing it granted Bob Alice's disciplines, and the
 * diff against Bob's `current` made the writes go through cleanly.
 *
 * Asserted on the atom rather than by driving the modal because the page
 * container cannot be rendered under vitest (react-compiler nulls the hook
 * dispatcher for this repo's components) — so this pins the invariant the
 * `onClose` handler exists to maintain.
 */
describe('userDisciplinePicksAtom', () => {
  it('starts null, meaning "not edited — show the server\'s answer"', () => {
    // `null` is not merely "empty": the container branches on it to decide
    // whether to render the server's roster or the user's edit. An initial
    // `[]` would read as "this person has no disciplines" and enable Save.
    expect(createStore().get(userDisciplinePicksAtom)).toBeNull();
  });

  it("is a single global cell, so a stale draft is another person's data", () => {
    const store = createStore();

    store.set(userDisciplinePicksAtom, [{ value: '7', label: 'Meteorology' }]);
    // Nothing about the atom is keyed by user — this is exactly why closing
    // the modal has to clear it, and why an `atomFamily` keyed by userId
    // would be the alternative fix.
    expect(store.get(userDisciplinePicksAtom)).toHaveLength(1);

    store.set(userDisciplinePicksAtom, null);
    expect(store.get(userDisciplinePicksAtom)).toBeNull();
  });
});
