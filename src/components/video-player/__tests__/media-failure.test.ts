import { describe, expect, it } from 'vitest';
import { MAX_RECOVERY_ATTEMPTS } from '#/components/video-player/compute-recovery-action';
import {
  captionLoadFailedPatch,
  fatalMediaOutcome,
} from '#/components/video-player/media-failure';

describe('fatalMediaOutcome', () => {
  it('retries while the budget lasts and reports no failure yet', () => {
    const out = fatalMediaOutcome(0);
    expect(out.retry).toEqual({ attempt: 1 });
    expect(out.failedMessage).toBeNull();
    expect(out.patch.status).toBe('error');
  });

  it('reports the failure exactly when the budget is spent', () => {
    const out = fatalMediaOutcome(MAX_RECOVERY_ATTEMPTS);
    expect(out.retry).toBeNull();
    expect(out.failedMessage).toBe(out.patch.error);
    expect(out.failedMessage).toMatch(/couldn't be played/i);
  });
});

describe('captionLoadFailedPatch', () => {
  it('turns captions off and marks them unavailable, so CC states why', () => {
    expect(captionLoadFailedPatch()).toEqual({
      hasCaptions: false,
      captionsEnabled: false,
      captionsUnavailable: true,
    });
  });
});
