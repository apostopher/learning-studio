import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { videoReachedEndAtomFamily } from '../lesson-player-atoms';

describe('videoReachedEndAtomFamily', () => {
  it('starts false for a video nobody has watched', () => {
    const store = createStore();
    expect(store.get(videoReachedEndAtomFamily('v-fresh'))).toBe(false);
  });

  it('does not leak the ended flag from one lesson to the next', () => {
    // The bug this replaces: a single module-level atom meant finishing
    // lesson A left `videoEnded === true`, so clicking lesson B mounted its
    // player with the coverage notice already covering a video that had not
    // started — "You've watched 0 of 18 sections" over frame zero.
    const store = createStore();
    store.set(videoReachedEndAtomFamily('v-lesson-a'), true);

    expect(store.get(videoReachedEndAtomFamily('v-lesson-b'))).toBe(false);
    expect(store.get(videoReachedEndAtomFamily('v-lesson-a'))).toBe(true);
  });

  it('returns the same atom for the same lessonSlug, so the container and its overlay agree', () => {
    expect(videoReachedEndAtomFamily('v-1')).toBe(
      videoReachedEndAtomFamily('v-1'),
    );
    expect(videoReachedEndAtomFamily('v-1')).not.toBe(
      videoReachedEndAtomFamily('v-2'),
    );
  });
});
