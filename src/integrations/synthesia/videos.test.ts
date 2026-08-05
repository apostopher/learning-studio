// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#/env', () => ({ env: { SYNTHESIA_API_KEY: 'env-key' } }));

// videos.ts builds a cached reader at import time; redis.ts would call
// Redis.fromEnv(). The cache is irrelevant to page parsing.
vi.mock('#/integrations/upstash/redis', () => ({
  cacheWithRedis: (_prefix: string, fn: (args: unknown) => unknown) =>
    Object.assign(fn, { invalidate: vi.fn() }),
}));

import { getVideosByPage, SYNTHESIA_PAGE_SIZE } from './videos';

const video = (id: string) => ({
  id,
  status: 'complete' as const,
  download: 'https://cdn.synthesia.io/v.mp4',
  captions: { srt: null, vtt: null },
  thumbnail: { gif: null, image: `https://cdn.synthesia.io/${id}.jpg` },
});

/** Shape Synthesia has never sent and the schema cannot place. */
const unrecognised = { id: 'weird', status: 'something-new', nope: true };

const respondWith = (videos: unknown[]) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos }),
    }),
  );
};

describe('getVideosByPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the recognisable videos and drops the rest', async () => {
    // A page holds 100. Rejecting all of them because one record has an
    // unexpected shape is how a whole course lost its posters.
    respondWith([video('a'), unrecognised, video('b')]);

    const page = await getVideosByPage(1, 'sk_course');

    expect(page.videos.map((v) => v.id)).toEqual(['a', 'b']);
  });

  it('reports more pages from the raw count, not the surviving one', async () => {
    // THE TRAP: a full page with one dropped record leaves 99 survivors. A
    // caller comparing 99 against the page size would decide the sweep was
    // finished and silently skip every later page.
    const full = [
      unrecognised,
      ...Array.from({ length: SYNTHESIA_PAGE_SIZE - 1 }, (_, i) =>
        video(`v${i}`),
      ),
    ];
    respondWith(full);

    const page = await getVideosByPage(1, 'sk_course');

    expect(page.videos).toHaveLength(SYNTHESIA_PAGE_SIZE - 1);
    expect(page.hasMore).toBe(true);
  });

  it('reports no more pages for a short page', async () => {
    respondWith([video('a')]);

    expect((await getVideosByPage(1, 'sk_course')).hasMore).toBe(false);
  });

  it('reports no more pages for an empty page', async () => {
    respondWith([]);

    expect((await getVideosByPage(1, 'sk_course')).hasMore).toBe(false);
  });

  it('still throws when Synthesia refuses the request', async () => {
    // Tolerance is for individual records. An outage or a rejected key is
    // still a failure the caller must see.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    await expect(getVideosByPage(1, 'sk_course')).rejects.toThrow(
      'GET_VIDEOS_PAGE_ERROR',
    );
  });

  it('still rejects a response that is not a page at all', async () => {
    // Per-record tolerance must not become "accept any JSON".
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: 1 }) }),
    );

    await expect(getVideosByPage(1, 'sk_course')).rejects.toThrow();
  });
});
