import { describe, expect, it } from 'vitest';
import type { PlaybackResult } from '#/lib/video-providers/resolve.server';
import {
  canDebriefFromTranscript,
  playbackHasCaptions,
} from '../compute-transcript-debrief';

const ready = (captions: { vtt: string } | null): PlaybackResult => ({
  status: 'ready',
  url: 'https://example.test/v.m3u8',
  kind: 'hls',
  expiresInSeconds: 3600,
  poster: null,
  captions,
});

describe('playbackHasCaptions', () => {
  it('is true only for a ready video with a caption track', () => {
    expect(playbackHasCaptions(ready({ vtt: 'https://x/c.vtt' }))).toBe(true);
  });

  it('is false when the provider has no text track', () => {
    // Mux on this account — see resolve.server.ts.
    expect(playbackHasCaptions(ready(null))).toBe(false);
  });

  it('is false while playback is still resolving or unavailable', () => {
    // Conservative on purpose: the debrief appears once it is known to work,
    // rather than flickering in and back out as the query settles.
    expect(playbackHasCaptions(undefined)).toBe(false);
    expect(playbackHasCaptions({ status: 'rendering' })).toBe(false);
    expect(playbackHasCaptions({ status: 'failed' })).toBe(false);
  });
});

describe('canDebriefFromTranscript', () => {
  it('needs both the admin switch and a caption track', () => {
    expect(
      canDebriefFromTranscript({ hasDebrief: true, hasCaptions: true }),
    ).toBe(true);
    expect(
      canDebriefFromTranscript({ hasDebrief: false, hasCaptions: true }),
    ).toBe(false);
    expect(
      canDebriefFromTranscript({ hasDebrief: true, hasCaptions: false }),
    ).toBe(false);
  });
});
