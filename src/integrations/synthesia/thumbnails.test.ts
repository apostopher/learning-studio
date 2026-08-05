// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getVideosByPage, getVideoExpiry } = vi.hoisted(() => ({
  getVideosByPage: vi.fn(),
  getVideoExpiry: vi.fn(),
}));

// Relative specifier, matching the module under test. Mocked wholesale, which
// is exactly why videos.test.ts exists alongside this file: a mocked
// getVideosByPage cannot catch a change in what Synthesia actually returns,
// and that blind spot is how a real page shape took the feature down.
vi.mock('./videos', () => ({
  getVideosByPage,
  getVideoExpiry,
}));

// redis.ts calls Redis.fromEnv() at import time. The cache wrapper is a
// pass-through here; the sweep is what these tests are about.
vi.mock('../upstash/redis', () => ({
  cacheWithRedis: (_prefix: string, fn: (args: unknown) => unknown) =>
    Object.assign(fn, { invalidate: vi.fn() }),
}));

import { computeThumbnailCacheTTL, getVideoThumbnails } from './thumbnails';

const available = (id: string, image: string | null) => ({
  id,
  status: 'complete' as const,
  download: 'https://cdn.synthesia.io/v.mp4',
  captions: { srt: null, vtt: null },
  thumbnail: { gif: null, image },
});

/**
 * A full page — Synthesia has more. `hasMore` comes from the RAW entry count
 * inside getVideosByPage, so it stays true even when parsing dropped records
 * and left the array short.
 */
const fullPage = (videos: unknown[]) => ({ videos, hasMore: true });

/** A short page — the end of the account. */
const lastPage = (videos: unknown[]) => ({ videos, hasMore: false });

describe('getVideoThumbnails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps each available video id to its thumbnail image', async () => {
    getVideosByPage.mockResolvedValue(
      lastPage([
        available('vid_1', 'https://cdn.synthesia.io/1.jpg'),
        available('vid_2', 'https://cdn.synthesia.io/2.jpg'),
      ]),
    );

    expect(await getVideoThumbnails('sk_course')).toEqual({
      vid_1: 'https://cdn.synthesia.io/1.jpg',
      vid_2: 'https://cdn.synthesia.io/2.jpg',
    });
  });

  it('skips videos that are not ready and videos with no thumbnail', async () => {
    getVideosByPage.mockResolvedValue(
      lastPage([
        available('vid_1', 'https://cdn.synthesia.io/1.jpg'),
        available('vid_2', null),
        { id: 'vid_3', status: 'in_progress' as const },
      ]),
    );

    expect(await getVideoThumbnails('sk_course')).toEqual({
      vid_1: 'https://cdn.synthesia.io/1.jpg',
    });
  });

  it('uses the supplied key, never the env key', async () => {
    getVideosByPage.mockResolvedValue(lastPage([]));

    await getVideoThumbnails('sk_course');

    expect(getVideosByPage).toHaveBeenCalledWith(1, 'sk_course');
  });

  it('stops as soon as a page comes back short', async () => {
    // A short page means Synthesia has nothing more. Asking for page 2 would
    // be a wasted round trip on every board load.
    getVideosByPage.mockResolvedValue(
      lastPage([available('vid_1', 'https://cdn.synthesia.io/1.jpg')]),
    );

    await getVideoThumbnails('sk_course');

    expect(getVideosByPage).toHaveBeenCalledTimes(1);
  });

  it('keeps paging while pages come back full', async () => {
    getVideosByPage
      .mockResolvedValueOnce(
        fullPage([available('vid_1', 'https://cdn.synthesia.io/1.jpg')]),
      )
      .mockResolvedValueOnce(
        lastPage([available('vid_2', 'https://cdn.synthesia.io/2.jpg')]),
      );

    const thumbnails = await getVideoThumbnails('sk_course');

    expect(getVideosByPage).toHaveBeenCalledTimes(2);
    expect(getVideosByPage).toHaveBeenNthCalledWith(2, 2, 'sk_course');
    expect(thumbnails.vid_2).toBe('https://cdn.synthesia.io/2.jpg');
  });

  it('keeps paging when a full page arrived short because records were dropped', async () => {
    // THE TRAP this fix exists for. Parsing drops unrecognised records, so a
    // full page can hand back one video. Inferring "last page" from that
    // length would abandon the sweep and lose every later page's thumbnails.
    getVideosByPage
      .mockResolvedValueOnce(
        fullPage([available('vid_1', 'https://cdn.synthesia.io/1.jpg')]),
      )
      .mockResolvedValueOnce(
        lastPage([available('vid_2', 'https://cdn.synthesia.io/2.jpg')]),
      );

    const thumbnails = await getVideoThumbnails('sk_course');

    expect(getVideosByPage).toHaveBeenCalledTimes(2);
    expect(thumbnails.vid_2).toBe('https://cdn.synthesia.io/2.jpg');
  });

  it('gives up at the page cap rather than sweeping an account forever', async () => {
    getVideosByPage.mockResolvedValue(fullPage([]));

    await getVideoThumbnails('sk_course');

    expect(getVideosByPage).toHaveBeenCalledTimes(10);
  });
});

describe('computeThumbnailCacheTTL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns MAX_TTL_SECONDS when the thumbnail map is empty', () => {
    getVideoExpiry.mockReturnValue(null);

    expect(computeThumbnailCacheTTL({})).toBe(21600); // 6 hours
  });

  it('clamps already-expired URLs to MIN_TTL_SECONDS, never negative', () => {
    getVideoExpiry.mockReturnValue(-5);

    expect(
      computeThumbnailCacheTTL({
        vid_1: 'https://cdn.synthesia.io/1.jpg',
      }),
    ).toBe(300); // 5 minutes
  });

  it('uses the soonest expiry from a mix of valid and null values', () => {
    getVideoExpiry
      .mockReturnValueOnce(null) // first URL has no expiry
      .mockReturnValueOnce(500) // second URL expires in 500s
      .mockReturnValueOnce(null); // third URL has no expiry

    expect(
      computeThumbnailCacheTTL({
        vid_1: 'https://cdn.synthesia.io/1.jpg',
        vid_2: 'https://cdn.synthesia.io/2.jpg',
        vid_3: 'https://cdn.synthesia.io/3.jpg',
      }),
    ).toBe(500);
  });
});
