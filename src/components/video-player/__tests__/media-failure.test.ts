import { describe, expect, it } from 'vitest';
import { MAX_RECOVERY_ATTEMPTS } from '#/components/video-player/compute-recovery-action';
import {
  captionLoadFailedPatch,
  captionsSignature,
  fatalMediaOutcome,
  type ReattachRequest,
  reattachKey,
  recoveryAttemptsOnPlaying,
  requestReattach,
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

/**
 * F1: Mux signs deterministically (noTimestamp, exp = floor(now) + 3600), so
 * a re-sign within the same second returns the SAME url. The attach effect
 * used to depend on `src` alone, so an identical refetched url never
 * re-attached, no further fatal error arrived, the budget was never spent
 * and `onPlaybackFailed` never fired — the admin sat on "Reconnecting…".
 *
 * The consumer of `reattachKey` is the attach effect's dependency list: a
 * changed key is what makes it run again.
 */
describe('recovery re-attach after the refetch settles', () => {
  const SRC = 'https://stream.mux.com/abc.m3u8?token=same';

  it('re-attaches an identical src, so a dead key still spends the budget and reports failure', () => {
    let attempts = 0;
    let req: ReattachRequest = null;
    const failed: string[] = [];
    let attaches = 1; // the initial attach
    let key = reattachKey(req, SRC);

    // Each loop: a fatal 403 on the attached source, then the refetch
    // settles with the very same url.
    for (let i = 0; i < MAX_RECOVERY_ATTEMPTS + 1; i++) {
      const out = fatalMediaOutcome(attempts);
      if (out.failedMessage !== null) {
        failed.push(out.failedMessage);
        break;
      }
      attempts = out.retry?.attempt ?? attempts;
      req = requestReattach(req, SRC);
      const next = reattachKey(req, SRC);
      if (next !== key) attaches++;
      key = next;
    }

    expect(attaches).toBe(1 + MAX_RECOVERY_ATTEMPTS);
    expect(failed).toEqual([
      fatalMediaOutcome(MAX_RECOVERY_ATTEMPTS).patch.error,
    ]);
  });

  it('adds no second attach when a fresh src already arrived (the src change attached it)', () => {
    const first = requestReattach(null, 'u1');
    // Rendered with the fresh url and the first request: already attached.
    const keyAtFreshSrc = reattachKey(first, 'u2');
    // A later recovery for the OLD url settles after u2 is showing.
    const second = requestReattach(first, 'u1');
    expect(reattachKey(second, 'u2')).toBe(keyAtFreshSrc);
  });

  it('changes the key on every settled recovery for the same src', () => {
    const a = requestReattach(null, 'u1');
    const b = requestReattach(a, 'u1');
    expect(reattachKey(a, 'u1')).not.toBe(reattachKey(null, 'u1'));
    expect(reattachKey(b, 'u1')).not.toBe(reattachKey(a, 'u1'));
  });
});

/** M3: a recovery that actually got playback going re-arms the budget. */
describe('recoveryAttemptsOnPlaying', () => {
  it('resets the budget once a re-attached source plays', () => {
    expect(recoveryAttemptsOnPlaying(2, true)).toBe(0);
  });
  it('leaves it alone when nothing was re-attached since the failure', () => {
    expect(recoveryAttemptsOnPlaying(1, false)).toBe(1);
  });
});
