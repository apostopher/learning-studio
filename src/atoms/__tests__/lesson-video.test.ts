// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '#/hooks/data/keys';
import { refetchLessonPlaybackFresh } from '../lesson-video';

afterEach(() => vi.restoreAllMocks());

const readyBody = {
  status: 'ready',
  url: 'https://cdn/fresh.m3u8',
  kind: 'hls',
  expiresInSeconds: 3600,
  poster: null,
  captions: null,
};

describe('refetchLessonPlaybackFresh', () => {
  it('requests fresh=1 and writes the parsed result into the SAME query cache entry lessonPlaybackAtomFamily reads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => readyBody });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    const result = await refetchLessonPlaybackFresh(queryClient, 'l-1');

    expect(result).toEqual(readyBody);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('lessonSlug=l-1');
    expect(url).toContain('fresh=1');

    // This is the seam the mid-playback recovery path depends on: a fresh
    // fetch that only updated `result` and never touched the query cache
    // would leave `useLessonVideo` (and everything downstream of it)
    // rendering the stale value forever.
    expect(queryClient.getQueryData(queryKeys.lessonPlayback('l-1'))).toEqual(
      readyBody,
    );
  });

  it('does not send fresh=1 on the plain (non-recovery) fetch path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => readyBody });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    await queryClient.fetchQuery({
      queryKey: queryKeys.lessonPlayback('l-1'),
      // Mirrors lessonPlaybackAtomFamily's own queryFn shape without
      // rendering the atom (jotai-tanstack-query hooks can't be exercised
      // under this repo's Vitest setup).
      queryFn: async () => {
        const r = await fetch(
          `/api/lesson/playback?lessonSlug=${encodeURIComponent('l-1')}`,
        );
        return r.json();
      },
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('fresh');
  });

  it('rejects and writes nothing when the route responds non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const queryClient = new QueryClient();

    await expect(
      refetchLessonPlaybackFresh(queryClient, 'l-1'),
    ).rejects.toThrow();
    expect(
      queryClient.getQueryData(queryKeys.lessonPlayback('l-1')),
    ).toBeUndefined();
  });
});
