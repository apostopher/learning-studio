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
    expect(state.captions).toEqual([
      { src: 'https://cdn/c.vtt', lang: 'en', label: 'English' },
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

  it('emits no captions and flags captions unavailable when the provider has no captions', () => {
    const state = playbackToState({ ...ready, captions: null }, vi.fn());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.captions).toEqual([]);
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

  it('labels the caption track with the played language and carries the language list', () => {
    const state = playbackToState(
      { ...ready, lang: 'fr-CA', languages: ['en', 'fr-CA'] },
      vi.fn(),
    );
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.lang).toBe('fr-CA');
    expect(state.languages).toEqual(['en', 'fr-CA']);
    expect(state.captions[0]).toMatchObject({
      lang: 'fr-CA',
      label: 'Canadian French',
    });
  });

  it('defaults to English when a result carries no language (older callers)', () => {
    const state = playbackToState(ready, vi.fn());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.lang).toBe('en');
    expect(state.languages).toEqual(['en']);
  });
});

describe('playbackToState preview', () => {
  it('hands the player the cap the server sent, parsed from the wire', async () => {
    const { learnerPlaybackSchema } = await import('#/lib/admin-schemas');
    const wire = learnerPlaybackSchema.parse({
      ...ready,
      lang: 'en',
      languages: ['en'],
      preview: { seconds: 15, fullDurationSeconds: 853.5 },
    });
    const state = playbackToState(wire, vi.fn());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.preview).toEqual({ seconds: 15, fullDurationSeconds: 853.5 });
  });

  it('has no preview for a full playback', () => {
    const state = playbackToState(ready, vi.fn());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state).not.toHaveProperty('preview');
  });
});
