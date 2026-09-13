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

// The lesson as the route names it: the course is part of the identity now
// (Task 6a) — the same lesson slug in two courses is two different playbacks.
const lesson = { courseSlug: 'c-1', lessonSlug: 'l-1' };

describe('refetchLessonPlaybackFresh', () => {
  it('requests fresh=1 and writes the parsed result into the SAME query cache entry lessonPlaybackAtomFamily reads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => readyBody });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();

    const result = await refetchLessonPlaybackFresh(queryClient, lesson);

    expect(result).toEqual(readyBody);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('lessonSlug=l-1');
    expect(url).toContain('courseSlug=c-1');
    expect(url).toContain('fresh=1');

    // This is the seam the mid-playback recovery path depends on: a fresh
    // fetch that only updated `result` and never touched the query cache
    // would leave `useLessonVideo` (and everything downstream of it)
    // rendering the stale value forever.
    expect(queryClient.getQueryData(queryKeys.lessonPlayback(lesson))).toEqual(
      readyBody,
    );
  });

  it('rejects and writes nothing when the route responds non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const queryClient = new QueryClient();

    await expect(
      refetchLessonPlaybackFresh(queryClient, lesson),
    ).rejects.toThrow();
    expect(
      queryClient.getQueryData(queryKeys.lessonPlayback(lesson)),
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

    const result = await fetchLessonPlayback(lesson);

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

    await fetchLessonPlayback(lesson, { fresh: true });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('fresh=1');
  });

  it('names the course the route is on, so the server gates and signs for THAT course', async () => {
    // The playback route 400s without it and, with it, resolves the lesson
    // inside that course (Task 6a). The whole URL is asserted so a param
    // that was renamed or dropped cannot pass on a substring match.
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => readyBody });
    vi.stubGlobal('fetch', fetchMock);

    await fetchLessonPlayback({ courseSlug: 'course-b', lessonSlug: 'l-1' });

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/lesson/playback?lessonSlug=l-1&courseSlug=course-b',
    );
  });
});

describe('lessonPlayback query key', () => {
  it('is distinct per course for the same lesson slug', () => {
    // Two courses teaching one lesson must never share a cache entry: the
    // signed URL, and whether it is served at all, depend on the course.
    expect(
      queryKeys.lessonPlayback({ courseSlug: 'a', lessonSlug: 'l' }),
    ).not.toEqual(
      queryKeys.lessonPlayback({ courseSlug: 'b', lessonSlug: 'l' }),
    );
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

    const error = await fetchLessonPlayback(lesson).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlaybackError);
    expect((error as PlaybackError).code).toBe('PROVIDER_NOT_CONFIGURED');
    expect((error as PlaybackError).message).toMatch(/credentials/i);
  });

  it('still fails clearly when the body carries no code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => 'nope' }),
    );

    const error = await fetchLessonPlayback(lesson).catch((e: unknown) => e);

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

    await expect(fetchLessonPlayback(lesson)).rejects.toThrow();
  });
});
