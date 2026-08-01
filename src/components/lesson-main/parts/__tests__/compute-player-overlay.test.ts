import { describe, expect, it } from 'vitest';
import { computePlayerOverlay } from '../compute-player-overlay';

/** Paused on the last frame — the state the `ended` event leaves behind. */
const atEnd = { paused: true, currentTime: 120, duration: 120 };
/** Playing again after the student pressed play or rewound. */
const playing = { paused: false, currentTime: 12, duration: 120 };
/** Paused after seeking back into the video. */
const seekedBack = { paused: true, currentTime: 30, duration: 120 };

describe('computePlayerOverlay', () => {
  it('shows the debrief overlay on the normal unlocked path — must not regress', () => {
    // Video ended, material unlocked, no test generated yet: this is the
    // working feature that Task 12 must not delete while fixing the locked
    // case. See task-12-report.md for the red-then-green evidence of this
    // specific test.
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: atEnd,
        materialLocked: false,
        hasCurrentTest: false,
        hasDebrief: true,
        canDebrief: true,
      }),
    ).toBe('debrief');
  });

  it('shows the coverage notice when the video ended but material is locked', () => {
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: atEnd,
        materialLocked: true,
        hasCurrentTest: false,
        hasDebrief: true,
        canDebrief: true,
      }),
    ).toBe('coverage');
  });

  it('shows nothing once a test already exists for the unlocked material', () => {
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: atEnd,
        materialLocked: false,
        hasCurrentTest: true,
        hasDebrief: true,
        canDebrief: true,
      }),
    ).toBe('none');
  });

  it('shows nothing before the video ends, regardless of lock or test state', () => {
    for (const materialLocked of [false, true]) {
      for (const hasCurrentTest of [false, true]) {
        expect(
          computePlayerOverlay({
            reachedEnd: false,
            playback: playing,
            materialLocked,
            hasCurrentTest,
            hasDebrief: true,
            canDebrief: true,
          }),
        ).toBe('none');
      }
    }
  });

  it('locked always wins over an existing test — never both overlays at once', () => {
    // The return type is a single PlayerOverlayKind, so "both selected" can't
    // even be expressed — this exercises the one input combination where a
    // boolean-pair design could have been ambiguous.
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: atEnd,
        materialLocked: true,
        hasCurrentTest: true,
        hasDebrief: true,
        canDebrief: true,
      }),
    ).toBe('coverage');
  });

  it('stops covering the video once playback resumes after an incomplete watch', () => {
    // The notice is absolute inset-0 over an 85% opaque background and tells
    // the student to "watch the parts you skipped". Leaving it up while they
    // do exactly that makes the instruction impossible to follow — and before
    // this it stayed up for the rest of the session, because nothing ever
    // cleared the flag.
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: playing,
        materialLocked: true,
        hasCurrentTest: false,
        hasDebrief: true,
        canDebrief: true,
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
        hasCurrentTest: false,
        hasDebrief: true,
        canDebrief: true,
      }),
    ).toBe('none');
  });

  it('hides the debrief prompt too while a finished video is being rewatched', () => {
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: playing,
        materialLocked: false,
        hasCurrentTest: false,
        hasDebrief: true,
        canDebrief: true,
      }),
    ).toBe('none');
  });

  it('comes back when the rewatch reaches the end again', () => {
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: { paused: true, currentTime: 119.4, duration: 120 },
        materialLocked: true,
        hasCurrentTest: false,
        hasDebrief: true,
        canDebrief: true,
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
        hasCurrentTest: false,
        hasDebrief: true,
        canDebrief: true,
      }),
    ).toBe('coverage');
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: { paused: true, currentTime: 0, duration: Number.NaN },
        materialLocked: true,
        hasCurrentTest: false,
        hasDebrief: true,
        canDebrief: true,
      }),
    ).toBe('coverage');
  });

  it('shows no overlay when the lesson has no debrief', () => {
    // has_debrief off means tab 2 is the authored quiz — there is no debrief
    // to offer, and offering one anyway was the regression against the old
    // platform that this flag now closes.
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: atEnd,
        materialLocked: false,
        hasCurrentTest: false,
        hasDebrief: false,
        canDebrief: true,
      }),
    ).toBe('none');
  });

  it('shows no overlay when no debrief can be generated', () => {
    // onDebrief bails without key points and text, so the button would be a
    // press that silently does nothing.
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: atEnd,
        materialLocked: false,
        hasCurrentTest: false,
        hasDebrief: true,
        canDebrief: false,
      }),
    ).toBe('none');
  });

  it('still prefers the coverage notice over a suppressed debrief', () => {
    // The locked-material remedy has to win regardless: it is the only thing
    // telling the student what to do next.
    expect(
      computePlayerOverlay({
        reachedEnd: true,
        playback: atEnd,
        materialLocked: true,
        hasCurrentTest: false,
        hasDebrief: false,
        canDebrief: false,
      }),
    ).toBe('coverage');
  });
});
