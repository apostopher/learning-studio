import { describe, expect, it } from 'vitest';
import { MAX_RECOVERY_ATTEMPTS } from '#/components/video-player/compute-recovery-action';
import {
  captionLoadFailedPatch,
  captionsSignature,
  fatalMediaOutcome,
  resolveHasCaptions,
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

describe('captionsSignature', () => {
  const en = { src: 'en.vtt', lang: 'en', label: 'English' };

  it('is equal for a rebuilt array with the same srcs, so a parent re-render keeps a load error', () => {
    expect(captionsSignature([{ ...en }])).toBe(captionsSignature([{ ...en }]));
  });

  it('changes when a src changes (fresh signed URL), which resets the error', () => {
    expect(captionsSignature([en])).not.toBe(
      captionsSignature([{ ...en, src: 'en.vtt?sig=2' }]),
    );
  });

  it('treats undefined and empty alike', () => {
    expect(captionsSignature(undefined)).toBe(captionsSignature([]));
  });
});

describe('resolveHasCaptions', () => {
  it('is false while captions are known unavailable, even if a dead <track> exists', () => {
    expect(resolveHasCaptions(1, true)).toBe(false);
  });
  it('follows the track count otherwise', () => {
    expect(resolveHasCaptions(1, false)).toBe(true);
    expect(resolveHasCaptions(0, false)).toBe(false);
  });
});
