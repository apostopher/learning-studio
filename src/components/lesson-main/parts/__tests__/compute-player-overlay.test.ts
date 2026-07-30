import { describe, expect, it } from 'vitest';
import { computePlayerOverlay } from '../compute-player-overlay';

describe('computePlayerOverlay', () => {
  it('shows the debrief overlay on the normal unlocked path — must not regress', () => {
    // Video ended, material unlocked, no test generated yet: this is the
    // working feature that Task 12 must not delete while fixing the locked
    // case. See task-12-report.md for the red-then-green evidence of this
    // specific test.
    expect(
      computePlayerOverlay({
        videoEnded: true,
        materialLocked: false,
        hasCurrentTest: false,
      }),
    ).toBe('debrief');
  });

  it('shows the coverage notice when the video ended but material is locked', () => {
    expect(
      computePlayerOverlay({
        videoEnded: true,
        materialLocked: true,
        hasCurrentTest: false,
      }),
    ).toBe('coverage');
  });

  it('shows nothing once a test already exists for the unlocked material', () => {
    expect(
      computePlayerOverlay({
        videoEnded: true,
        materialLocked: false,
        hasCurrentTest: true,
      }),
    ).toBe('none');
  });

  it('shows nothing before the video ends, regardless of lock or test state', () => {
    expect(
      computePlayerOverlay({
        videoEnded: false,
        materialLocked: false,
        hasCurrentTest: false,
      }),
    ).toBe('none');
    expect(
      computePlayerOverlay({
        videoEnded: false,
        materialLocked: true,
        hasCurrentTest: false,
      }),
    ).toBe('none');
    expect(
      computePlayerOverlay({
        videoEnded: false,
        materialLocked: false,
        hasCurrentTest: true,
      }),
    ).toBe('none');
    expect(
      computePlayerOverlay({
        videoEnded: false,
        materialLocked: true,
        hasCurrentTest: true,
      }),
    ).toBe('none');
  });

  it('locked always wins over an existing test — never both overlays at once', () => {
    // The return type is a single PlayerOverlayKind, so "both selected" can't
    // even be expressed — this exercises the one input combination where a
    // boolean-pair design could have been ambiguous.
    expect(
      computePlayerOverlay({
        videoEnded: true,
        materialLocked: true,
        hasCurrentTest: true,
      }),
    ).toBe('coverage');
  });
});
