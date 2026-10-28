import { describe, expect, it } from 'vitest';
import {
  computePlayerOverlay,
  type PlayerOverlayKind,
} from '../compute-player-overlay';

/** Paused on the last frame — the state the `ended` event leaves behind. */
const atEnd = { paused: true, currentTime: 120, duration: 120 };
/** Playing again after the student pressed play or rewound. */
const playing = { paused: false, currentTime: 12, duration: 120 };
/** Paused after seeking back into the video. */
const seekedBack = { paused: true, currentTime: 30, duration: 120 };

describe('computePlayerOverlay', () => {
  it('shows nothing at the end of an unlocked video — the post-video Debrief button is gone', () => {
    // The debrief now opens 24h after the lesson is done, so a button at the
    // end of the video would offer something that cannot be taken yet. The
    // Debrief tab carries the schedule instead.
    //
    // The facts that used to summon the button ride along untyped: a debrief
    // lesson with a source and no session yet is exactly the input that
    // returned 'debrief', so this goes red if that branch ever comes back.
    const debriefLesson = {
      hasDebrief: true,
      canDebrief: true,
      hasCurrentTest: false,
    };
    const kind: PlayerOverlayKind = computePlayerOverlay({
      reachedEnd: true,
      playback: atEnd,
      materialLocked: false,
      ...debriefLesson,
    });
    expect(kind).toBe('none');
  });

  it('shows the coverage notice when the video ended but material is locked', () => {
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: atEnd,
        materialLocked: true,
      }),
    ).toBe('coverage');
  });

  it('shows nothing before the video ends, locked or not', () => {
    for (const materialLocked of [false, true]) {
      expect(
        computePlayerOverlay({
          reachedEnd: false,
          playback: playing,
          materialLocked,
        }),
      ).toBe('none');
    }
  });

  it('stops covering the video once playback resumes after an incomplete watch', () => {
    // The notice is absolute inset-0 over an 85% opaque background and tells
    // the student to "watch the parts you skipped". Leaving it up while they
    // do exactly that makes the instruction impossible to follow.
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: playing,
        materialLocked: true,
      }),
    ).toBe('none');
  });

  it('stops covering the video when the student seeks back while paused', () => {
    // Dragging the scrubber back does not fire `play`, so paused stays true;
    // the position is what proves they left the end state.
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: seekedBack,
        materialLocked: true,
      }),
    ).toBe('none');
  });

  it('comes back when the rewatch reaches the end again', () => {
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: { paused: true, currentTime: 119.4, duration: 120 },
        materialLocked: true,
      }),
    ).toBe('coverage');
  });

  it('trusts the ended event when the duration is unknown', () => {
    // Metadata not loaded, or a source that reports duration 0/NaN: with no
    // duration there is nothing to compare currentTime against, and
    // suppressing a notice we cannot disprove would resurrect the original
    // silent-gate failure.
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: { paused: true, currentTime: 0, duration: 0 },
        materialLocked: true,
      }),
    ).toBe('coverage');
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: { paused: true, currentTime: 0, duration: Number.NaN },
        materialLocked: true,
      }),
    ).toBe('coverage');
  });
});
