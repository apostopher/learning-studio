// @vitest-environment node
import { integer, pgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A real pgTable column (not a plain object stub) so `eq()` in the module
// under test builds a real query fragment against it — same "fully stub,
// never importOriginal" pattern as admin-course-cache-invalidation.test.ts
// and course-content-gating.test.ts. Defined here (not vi.hoisted) because the
// mock factories below only actually run when `#/db/lesson-playback` is
// dynamically imported at the bottom of this file, by which point this const
// has already been initialized.
const lessonVersionsTable = pgTable('lesson_versions', {
  id: integer('id').primaryKey(),
  lessonId: integer('lesson_id'),
});

/** Stands in for `db.select().from().where()`, the invalidate path's read. */
function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    where: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const db = vi.hoisted(() => ({ select: vi.fn() }));
const getPinnedSnapshot = vi.hoisted(() => vi.fn());
const admin = vi.hoisted(() => ({ resolveCourseProvider: vi.fn() }));
const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));
const providers = vi.hoisted(() => ({ resolvePlayback: vi.fn() }));

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ lessonVersionsTable }));
vi.mock('#/db/admin', () => admin);
vi.mock('#/integrations/upstash/redis', () => ({ redis: redisMock }));
vi.mock('#/lib/video-providers/resolve.server', () => providers);
// The pinned read and the invalidate path's lookups are inert here: their SQL
// is pinned in lesson-course-scoped-reads.test.ts and run on Postgres in
// course-lesson-content.test.ts.
vi.mock('#/db/course-lesson-content', () => ({ getPinnedSnapshot }));
vi.mock('#/db/lesson-access', () => ({ getLessonIdBySlug: vi.fn() }));
vi.mock('#/db/placements', () => ({ getCourseIdsForLesson: vi.fn() }));
vi.mock('#/db/video-captions', () => ({
  muxCaptionsForPlayback: vi.fn(async () => null),
}));

const { getLessonPlayback } = await import('#/db/lesson-playback');
const { muxCaptionsForPlayback } = await import('#/db/video-captions');

/**
 * The captions reader handed to `resolvePlayback` must be bound to THIS
 * lesson (its token-less fallback looks up the lesson's other courses).
 * Invoke the captured reader and assert what the real one received.
 */
async function expectCaptionsBoundTo(lessonId: number) {
  const deps = providers.resolvePlayback.mock.calls.at(-1)?.[3] as {
    muxCaptions: (ref: string, creds: unknown) => Promise<unknown>;
  };
  const creds = { keyId: 'serving' };
  await deps.muxCaptions('ref', creds);
  expect(muxCaptionsForPlayback).toHaveBeenCalledWith('ref', creds, lessonId);
}

/** Version 31 of lesson 9. */
const lessonRow = {
  id: 31,
  lessonId: 9,
  videoProvider: 'mux',
  videoRef: 'ref-1',
  otherVideoIds: [],
};
const inCourse = { courseId: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  admin.resolveCourseProvider.mockResolvedValue({ keyId: 'k' });
});

describe('getLessonPlayback', () => {
  it('returns a cache hit for the pinned version without resolving or writing again', async () => {
    const cached = {
      status: 'ready' as const,
      url: 'https://cdn/cached.m3u8',
      kind: 'hls' as const,
      expiresInSeconds: 60,
      poster: null,
      captions: null,
    };
    redisMock.get.mockResolvedValueOnce(cached);
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);

    const result = await getLessonPlayback('l1', inCourse);

    expect(result).toEqual(cached);
    expect(redisMock.get).toHaveBeenCalledWith('lesson-playback:3:l1:31:en');
    expect(getPinnedSnapshot).toHaveBeenCalledWith('l1', 3);
    expect(providers.resolvePlayback).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('does not cache a still-rendering result — it can change on its own', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);
    providers.resolvePlayback.mockResolvedValueOnce({ status: 'rendering' });

    const result = await getLessonPlayback('l1', inCourse);

    expect(result).toEqual({
      status: 'rendering',
      lang: 'en',
      languages: ['en'],
    });
    // The Critical this test guards: a pending result must never be written,
    // not written-with-a-wrong-TTL. `cacheWithRedis` could not express this
    // (its extractor's `null` fell back to a 6h default and `set` still ran).
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('does not cache a failed result either', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);
    providers.resolvePlayback.mockResolvedValueOnce({ status: 'failed' });

    const result = await getLessonPlayback('l1', inCourse);

    expect(result).toEqual({ status: 'failed', lang: 'en', languages: ['en'] });
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('caches a ready result with a TTL derived from its own expiry, minus the 30s margin', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);
    const ready = {
      status: 'ready' as const,
      url: 'https://cdn/v.mp4',
      kind: 'file' as const,
      expiresInSeconds: 90,
      poster: null,
      captions: null,
    };
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1', inCourse);

    expect(result).toEqual({ ...ready, lang: 'en', languages: ['en'] });
    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:3:l1:31:en',
      JSON.stringify({ ...ready, lang: 'en', languages: ['en'] }),
      { ex: 60 }, // 90 - 30
    );
  });

  it('caches for at most 60s while Mux captions are generating', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);
    const ready = {
      status: 'ready' as const,
      url: 'https://cdn/v.m3u8',
      kind: 'hls' as const,
      expiresInSeconds: 3600,
      poster: null,
      captions: null,
      captionsPending: true as const,
    };
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    await getLessonPlayback('l1', inCourse);

    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:3:l1:31:en',
      expect.any(String),
      { ex: 60 },
    );
  });

  it('caches for the full signature window (minus margin) when no captions are pending', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);
    const ready = {
      status: 'ready' as const,
      url: 'https://cdn/v.m3u8',
      kind: 'hls' as const,
      expiresInSeconds: 3600,
      poster: null,
      captions: null,
    };
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    await getLessonPlayback('l1', inCourse);

    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:3:l1:31:en',
      expect.any(String),
      { ex: 3570 },
    );
  });

  it('clamps the TTL to at least 1s when expiresInSeconds is under the margin', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);
    const ready = {
      status: 'ready' as const,
      url: 'https://cdn/v.mp4',
      kind: 'file' as const,
      expiresInSeconds: 10,
      poster: null,
      captions: null,
    };
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    await getLessonPlayback('l1', inCourse);

    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:3:l1:31:en',
      JSON.stringify({ ...ready, lang: 'en', languages: ['en'] }),
      { ex: 1 },
    );
  });

  it('does not cache a ready result with no known expiry — no safe TTL to guess', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);
    const ready = {
      status: 'ready' as const,
      url: 'https://cdn/v.mp4',
      kind: 'file' as const,
      expiresInSeconds: null,
      poster: 'https://cdn/p.jpg',
      captions: null,
    };
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1', inCourse);

    expect(result).toEqual({ ...ready, lang: 'en', languages: ['en'] });
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('does not cache a null result (no such lesson, or no version of it here)', async () => {
    getPinnedSnapshot.mockResolvedValueOnce(null);

    const result = await getLessonPlayback('missing', inCourse);

    expect(result).toBeNull();
    // No version, no key: nothing cached for another one may answer.
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('answers null for a version without a video', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce({ ...lessonRow, videoRef: null });

    expect(await getLessonPlayback('l1', inCourse)).toBeNull();
    expect(providers.resolvePlayback).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('skipCache bypasses the read and re-resolves, even though a cache entry exists', async () => {
    // The exact scenario the recovery path exists for: a still-live cache
    // entry (e.g. the same stale URL a client just observed a 403 from)
    // must not be handed back again. `redisMock.get` deliberately has no
    // queued value here — asserting it is never even called (below) is a
    // stronger guarantee than stubbing it and hoping it's ignored.
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);
    const fresh = {
      status: 'ready' as const,
      url: 'https://cdn/fresh.m3u8',
      kind: 'hls' as const,
      expiresInSeconds: 3600,
      poster: null,
      captions: null,
    };
    providers.resolvePlayback.mockResolvedValueOnce(fresh);

    const result = await getLessonPlayback('l1', {
      courseId: 3,
      skipCache: true,
    });

    expect(result).toEqual({ ...fresh, lang: 'en', languages: ['en'] });
    expect(redisMock.get).not.toHaveBeenCalled();
    // Still writes a fresh cache entry under the normal TTL rules.
    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:3:l1:31:en',
      JSON.stringify({ ...fresh, lang: 'en', languages: ['en'] }),
      { ex: 3570 },
    );
  });

  it('skipCache omitted (or false) still reads the cache as before', async () => {
    const cached = {
      status: 'ready' as const,
      url: 'https://cdn/cached.m3u8',
      kind: 'hls' as const,
      expiresInSeconds: 60,
      poster: null,
      captions: null,
    };
    redisMock.get.mockResolvedValueOnce(cached);
    getPinnedSnapshot.mockResolvedValueOnce(lessonRow);

    const result = await getLessonPlayback('l1', {
      courseId: 3,
      skipCache: false,
    });

    expect(result).toEqual(cached);
    expect(redisMock.get).toHaveBeenCalledWith('lesson-playback:3:l1:31:en');
    expect(providers.resolvePlayback).not.toHaveBeenCalled();
  });
});

describe('getLessonPlayback with a language', () => {
  const rowWithFrench = {
    id: 31,
    lessonId: 9,
    videoProvider: 'synthesia',
    videoRef: 'en-ref',
    otherVideoIds: [{ lang: 'fr-CA', provider: 'mux', ref: 'fr-ref' }],
  };
  const ready = {
    status: 'ready' as const,
    url: 'https://cdn/v.m3u8',
    kind: 'hls' as const,
    expiresInSeconds: 90,
    poster: null,
    captions: null,
  };

  it("resolves the alternate with THAT row's provider credentials and caches under the lang", async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce(rowWithFrench);
    admin.resolveCourseProvider.mockResolvedValueOnce({ keyId: 'mux-key' });
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1', {
      ...inCourse,
      lang: 'fr-CA',
    });

    expect(admin.resolveCourseProvider).toHaveBeenCalledWith(3, 'mux');
    expect(providers.resolvePlayback).toHaveBeenCalledWith(
      'mux',
      'fr-ref',
      { keyId: 'mux-key' },
      { muxCaptions: expect.any(Function) },
    );
    await expectCaptionsBoundTo(9);
    expect(result).toEqual({
      ...ready,
      lang: 'fr-CA',
      languages: ['en', 'fr-CA'],
    });
    expect(redisMock.get).toHaveBeenCalledWith('lesson-playback:3:l1:31:fr-CA');
    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:3:l1:31:fr-CA',
      JSON.stringify({ ...ready, lang: 'fr-CA', languages: ['en', 'fr-CA'] }),
      { ex: 60 },
    );
  });

  it('falls back to the primary video, reporting lang en, for a language the lesson lacks', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce(rowWithFrench);
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1', { ...inCourse, lang: 'ja' });

    expect(providers.resolvePlayback).toHaveBeenCalledWith(
      'synthesia',
      'en-ref',
      expect.anything(),
      { muxCaptions: expect.any(Function) },
    );
    await expectCaptionsBoundTo(9);
    expect(result).toMatchObject({ lang: 'en', languages: ['en', 'fr-CA'] });
  });

  it('treats an unparseable other_video_ids column as no alternates rather than failing playback', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    getPinnedSnapshot.mockResolvedValueOnce({
      ...rowWithFrench,
      otherVideoIds: [{ lang: 'FR', videoId: 'legacy' }],
    });
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1', { ...inCourse, lang: 'fr' });

    expect(result).toMatchObject({ lang: 'en', languages: ['en'] });
  });
});

describe('getLessonPlayback.invalidate', () => {
  it('evicts every language key of every version, for every course teaching the lesson', async () => {
    const access = await import('#/db/lesson-access');
    const placements = await import('#/db/placements');
    vi.mocked(access.getLessonIdBySlug).mockResolvedValueOnce(9);
    vi.mocked(placements.getCourseIdsForLesson).mockResolvedValueOnce([3, 4]);
    db.select.mockReturnValueOnce(makeChain([{ id: 30 }, { id: 31 }]));

    await getLessonPlayback.invalidate('l1');

    expect(redisMock.del).toHaveBeenCalledTimes(1);
    const keys = redisMock.del.mock.calls[0];
    expect(keys).toEqual(
      expect.arrayContaining([
        'lesson-playback:3:l1:30:en',
        'lesson-playback:3:l1:31:fr-CA',
        'lesson-playback:4:l1:31:ja',
        // The free-seat preview is cached apart, and goes with the rest.
        'lesson-playback:3:l1:30:en:preview15',
        'lesson-playback:4:l1:31:ja:preview15',
      ]),
    );
    // 2 courses × 2 versions × (en + 11 alternates) × (full + preview)
    expect(new Set(keys).size).toBe(96);
  });

  it('sends no DEL for a lesson no course has taken', async () => {
    const access = await import('#/db/lesson-access');
    const placements = await import('#/db/placements');
    vi.mocked(access.getLessonIdBySlug).mockResolvedValueOnce(9);
    vi.mocked(placements.getCourseIdsForLesson).mockResolvedValueOnce([]);
    db.select.mockReturnValueOnce(makeChain([]));

    await getLessonPlayback.invalidate('l1');

    expect(redisMock.del).not.toHaveBeenCalled();
  });
});
