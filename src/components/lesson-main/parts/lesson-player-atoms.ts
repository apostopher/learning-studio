import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/**
 * Whether a given video has fired `ended` at least once this session.
 *
 * Keyed by videoId, matching `videoPlayerStateAtomFamily`. It used to be one
 * module-level `atom(false)` shared by every lesson, and nothing ever set it
 * back: finishing lesson A and clicking lesson B mounted B with
 * `videoEnded === true`, so B opened with "You skipped ahead. You've watched 0
 * of 18 sections" laid over a video that had not started.
 *
 * The value is only ever set to `true` — deliberately. `computePlayerOverlay`
 * decides whether the end-of-video overlay is actually *shown* by combining
 * this with live playback position, so a resumed or rewound video hides the
 * overlay without anyone having to remember to clear a flag, and reaching the
 * end again brings it back. A cleared-flag design needs a write on every resume
 * and every seek, and gets stuck the first time one of those paths is missed.
 *
 * Lives in its own module so it can be exercised directly (see
 * __tests__/lesson-player-atoms.test.ts) without importing the hook-calling
 * container, which cannot load under Vitest.
 */
export const videoReachedEndAtomFamily = atomFamily((_videoId: string) =>
  atom(false),
);
