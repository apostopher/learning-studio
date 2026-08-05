// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signPlaybackId } = vi.hoisted(() => ({ signPlaybackId: vi.fn() }));

vi.mock('@mux/mux-node', () => ({
  default: vi.fn().mockImplementation(() => ({
    jwt: { signPlaybackId },
  })),
}));

const { getVideoThumbnailsWithCache } = vi.hoisted(() => ({
  getVideoThumbnailsWithCache: vi.fn(),
}));

vi.mock('../../integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache,
}));

import { buildLessonPosters } from './posters.server';

const muxCreds = { keyId: 'key_123', privateKey: 'priv_abc' };
const synthesiaCreds = { apiKey: 'sk_course' };

/** Hands each provider its own credential, as resolveCourseProvider does. */
const credsFor =
  (available: Record<string, unknown>) => async (provider: string) =>
    available[provider] ?? null;

describe('buildLessonPosters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signPlaybackId.mockResolvedValue('thumb-token');
    getVideoThumbnailsWithCache.mockResolvedValue({});
  });

  it('signs Mux posters with a thumbnail-audience token and the width claim', async () => {
    // image.mux.com validates a `t` audience claim, and for a signed playback
    // id every query param must also appear in the JWT claims — an unsigned
    // `width` 403s just as a video-audience token would.
    await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 1, provider: 'mux', ref: 'playback123' }],
      loadCredentials: credsFor({ mux: muxCreds }),
    });

    expect(signPlaybackId).toHaveBeenCalledWith('playback123', {
      keyId: 'key_123',
      keySecret: 'priv_abc',
      expiration: '21600s',
      type: 'thumbnail',
      params: { width: '160' },
    });
  });

  it('builds a Mux url carrying both the width and the token', async () => {
    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 1, provider: 'mux', ref: 'playback123' }],
      loadCredentials: credsFor({ mux: muxCreds }),
    });

    expect(posters[1]).toBe(
      'https://image.mux.com/playback123/thumbnail.jpg?width=160&token=thumb-token',
    );
  });

  it('asks Mux for no particular time, so it picks mid-video', async () => {
    // time=0 on a talking-head video is a black frame or a title card.
    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 1, provider: 'mux', ref: 'playback123' }],
      loadCredentials: credsFor({ mux: muxCreds }),
    });

    expect(posters[1]).not.toContain('time=');
  });

  it('maps Synthesia lessons to the swept thumbnail for their ref', async () => {
    getVideoThumbnailsWithCache.mockResolvedValue({
      vid_a: 'https://cdn.synthesia.io/a.jpg',
    });

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 2, provider: 'synthesia', ref: 'vid_a' }],
      loadCredentials: credsFor({ synthesia: synthesiaCreds }),
    });

    expect(posters[2]).toBe('https://cdn.synthesia.io/a.jpg');
    expect(getVideoThumbnailsWithCache).toHaveBeenCalledWith({
      courseId: 7,
      apiKey: 'sk_course',
    });
  });

  it('serves both providers in one map for a mixed course', async () => {
    getVideoThumbnailsWithCache.mockResolvedValue({
      vid_a: 'https://cdn.synthesia.io/a.jpg',
    });

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'playback123' },
        { id: 2, provider: 'synthesia', ref: 'vid_a' },
      ],
      loadCredentials: credsFor({ mux: muxCreds, synthesia: synthesiaCreds }),
    });

    expect(Object.keys(posters).sort()).toEqual(['1', '2']);
  });

  it('still returns Mux posters when the Synthesia sweep throws', async () => {
    // A poster is decoration. One provider being down must not cost the board
    // the other provider's posters.
    getVideoThumbnailsWithCache.mockRejectedValue(new Error('synthesia down'));

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'playback123' },
        { id: 2, provider: 'synthesia', ref: 'vid_a' },
      ],
      loadCredentials: credsFor({ mux: muxCreds, synthesia: synthesiaCreds }),
    });

    expect(posters[1]).toContain('image.mux.com');
    expect(posters[2]).toBeUndefined();
  });

  it('still returns Synthesia posters when the Mux key is unusable', async () => {
    signPlaybackId.mockRejectedValue(new Error('invalid key format'));
    getVideoThumbnailsWithCache.mockResolvedValue({
      vid_a: 'https://cdn.synthesia.io/a.jpg',
    });

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'playback123' },
        { id: 2, provider: 'synthesia', ref: 'vid_a' },
      ],
      loadCredentials: credsFor({ mux: muxCreds, synthesia: synthesiaCreds }),
    });

    expect(posters[1]).toBeUndefined();
    expect(posters[2]).toBe('https://cdn.synthesia.io/a.jpg');
  });

  it('omits only the ref whose signing failed, not the whole course', async () => {
    signPlaybackId.mockImplementation(async (ref: string) => {
      if (ref === 'bad') throw new Error('nope');
      return 'thumb-token';
    });

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'good' },
        { id: 2, provider: 'mux', ref: 'bad' },
      ],
      loadCredentials: credsFor({ mux: muxCreds }),
    });

    expect(posters[1]).toContain('image.mux.com');
    expect(posters[2]).toBeUndefined();
  });

  it('returns nothing, and calls no provider, when the course has no credentials', async () => {
    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'playback123' },
        { id: 2, provider: 'synthesia', ref: 'vid_a' },
      ],
      loadCredentials: credsFor({}),
    });

    expect(posters).toEqual({});
    expect(signPlaybackId).not.toHaveBeenCalled();
    expect(getVideoThumbnailsWithCache).not.toHaveBeenCalled();
  });

  it('never touches a provider the course has no lessons for', async () => {
    // A Mux-only course must not decrypt a Synthesia credential or sweep it.
    await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 1, provider: 'mux', ref: 'playback123' }],
      loadCredentials: credsFor({ mux: muxCreds, synthesia: synthesiaCreds }),
    });

    expect(getVideoThumbnailsWithCache).not.toHaveBeenCalled();
  });
});
