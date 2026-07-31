import { describe, expect, it, vi } from 'vitest';
import { playbackToState } from '#/lib/video-providers/playback-to-state';

const ready = {
  status: 'ready' as const,
  url: 'https://cdn/v.mp4',
  kind: 'file' as const,
  expiresInSeconds: 600,
  poster: 'https://cdn/p.jpg',
  captions: { vtt: 'https://cdn/c.vtt' },
};

describe('playbackToState', () => {
  it('is fetching until a result arrives', () => {
    expect(playbackToState(undefined, vi.fn()).status).toBe('fetching');
  });

  it('carries the url, poster, kind and a default English track', () => {
    const onRetry = vi.fn();
    const state = playbackToState(ready, onRetry);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.src).toBe('https://cdn/v.mp4');
    expect(state.kind).toBe('file');
    expect(state.poster).toBe('https://cdn/p.jpg');
    expect(state.tracks).toEqual([
      {
        src: 'https://cdn/c.vtt',
        srcLang: 'en',
        label: 'English',
        kind: 'subtitles',
        default: true,
      },
    ]);
    expect(state.captionsUnavailable).toBe(false);
    // The exact same callback the caller passed in — this is the seam
    // `VideoPlayerContainer` calls on a mid-playback 401/403 to re-resolve
    // playback, not a locally-fabricated no-op.
    expect(state.onRetry).toBe(onRetry);
  });

  it('carries an hls kind through unchanged', () => {
    const state = playbackToState({ ...ready, kind: 'hls' }, vi.fn());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.kind).toBe('hls');
  });

  it('emits no tracks and flags captions unavailable when the provider has no captions', () => {
    const state = playbackToState({ ...ready, captions: null }, vi.fn());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.tracks).toEqual([]);
    // This is the fact a Mux-backed video always reports (Mux text tracks
    // aren't configured on this account) — the player must be told, not left
    // to infer "no captions needed" from an empty track list alone.
    expect(state.captionsUnavailable).toBe(true);
  });

  it('maps a still-rendering video to the rendering state', () => {
    expect(playbackToState({ status: 'rendering' }, vi.fn()).status).toBe(
      'rendering',
    );
  });

  it('maps a failed render to an error with a retry', () => {
    const onRetry = vi.fn();
    const state = playbackToState({ status: 'failed' }, onRetry);
    if (state.status !== 'error') throw new Error('expected error');
    expect(state.onRetry).toBe(onRetry);
  });
});
