import { describe, expect, it } from 'vitest';
import { learnerPlaybackSchema } from '#/lib/admin-schemas';
import { computeVideoPreviewState } from '../compute-video-preview-state';

describe('computeVideoPreviewState', () => {
  it('is empty when there is no playback data yet', () => {
    expect(computeVideoPreviewState(undefined)).toEqual({ kind: 'empty' });
    expect(computeVideoPreviewState(null)).toEqual({ kind: 'empty' });
  });

  it('parses a rendering wire body and reaches the rendering state — not an error, not a silently-faked ready player', () => {
    // The real schema, not a hand-typed stand-in for its output: this is the
    // exact body the admin video-playback route now sends for a Synthesia
    // video mid-render (resolvePlayback returns {status:'rendering'} instead
    // of throwing). A schema-only test would pass even if this function
    // still ignored `status` — this asserts on what the parsed value
    // actually becomes downstream.
    const parsed = learnerPlaybackSchema.parse({
      status: 'rendering',
      lang: 'en',
      languages: ['en'],
    });

    expect(computeVideoPreviewState(parsed)).toEqual({ kind: 'rendering' });
  });

  it('parses a failed wire body and reaches the failed state', () => {
    const parsed = learnerPlaybackSchema.parse({
      status: 'failed',
      lang: 'en',
      languages: ['en'],
    });

    expect(computeVideoPreviewState(parsed)).toEqual({ kind: 'failed' });
  });

  it('parses a ready wire body and carries the playback through untouched', () => {
    const body = {
      status: 'ready' as const,
      url: 'https://cdn.synthesia.io/video.mp4',
      kind: 'file' as const,
      expiresInSeconds: 600,
      poster: null,
      captions: null,
      lang: 'en' as const,
      languages: ['en' as const],
    };
    const parsed = learnerPlaybackSchema.parse(body);

    expect(computeVideoPreviewState(parsed)).toEqual({
      kind: 'ready',
      playback: body,
    });
  });

  it('rejects a wire body with an unrecognized status instead of silently matching a branch', () => {
    expect(() => learnerPlaybackSchema.parse({ status: 'unknown' })).toThrow();
  });
});
