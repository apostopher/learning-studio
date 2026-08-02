// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '#/hooks/data/keys';
import { PlaybackError } from '#/lib/video-providers/errors';
import {
  fetchLessonPlayback,
  refetchLessonPlaybackFresh,
} from '../lesson-video';

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

describe('fetchLessonPlayback', () => {
  // This is the exact function `lessonPlaybackAtomFamily`'s default `queryFn`
  // calls (`queryFn: () => fetchLessonPlayback(lessonSlug)`) — jotai-tanstack-
  // query hooks can't be rendered under this repo's Vitest setup, so calling
  // this directly, rather than a hand-rolled duplicate of its querystring
  // logic, is the closest this suite can get to exercising the real atom's
  // default (non-recovery) fetch path and still catch a regression in it.
  it('does not send fresh=1 when called with no opts (the plain, non-recovery path)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => readyBody });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLessonPlayback('l-1');

    expect(result).toEqual(readyBody);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('lessonSlug=l-1');
    expect(url).not.toContain('fresh');
  });

  it('sends fresh=1 only when explicitly asked for', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => readyBody });
    vi.stubGlobal('fetch', fetchMock);

    await fetchLessonPlayback('l-1', { fresh: true });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('fresh=1');
  });
});

describe('fetchLessonPlayback failures', () => {
  it('surfaces the server code and message instead of one generic error', async () => {
    // A course with no provider credentials showed the learner "Failed to
    // fetch playback" and a Retry that could never succeed — 83 lessons were
    // dead this way with nothing anywhere naming the cause.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: 'This course has no synthesia credentials configured.',
          code: 'PROVIDER_NOT_CONFIGURED',
        }),
      }),
    );

    const error = await fetchLessonPlayback('l-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlaybackError);
    expect((error as PlaybackError).code).toBe('PROVIDER_NOT_CONFIGURED');
    expect((error as PlaybackError).message).toMatch(/credentials/i);
  });

  it('still fails clearly when the body carries no code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => 'nope' }),
    );

    const error = await fetchLessonPlayback('l-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/failed to fetch playback/i);
  });

  it('does not choke when the error body is not JSON at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );

    await expect(fetchLessonPlayback('l-1')).rejects.toThrow();
  });
});
