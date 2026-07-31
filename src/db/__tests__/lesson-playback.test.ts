// @vitest-environment node
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real pgTable columns (not plain object stubs) so `eq()` in the module under
// test builds real query fragments against them — same "fully stub, never
// importOriginal" pattern as admin-course-cache-invalidation.test.ts and
// course-content-gating.test.ts. Defined here (not vi.hoisted) because the
// mock factories below only actually run when `#/db/lesson-playback` is
// dynamically imported at the bottom of this file, by which point these
// consts have already been initialized.
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  slug: text('slug'),
  videoProvider: text('video_provider'),
  videoRef: text('video_ref'),
});
const modulesTable = pgTable('modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
});

/**
 * A chainable stub standing in for `db.select().from().innerJoin().where()`.
 * The chain is itself thenable so an `await` on the unresolved builder (no
 * terminal `.returning()`/`.limit()` call, matching the real query in
 * `resolveLessonPlaybackUncached`) resolves too.
 */
function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
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
const admin = vi.hoisted(() => ({ resolveCourseProvider: vi.fn() }));
const redisMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
const providers = vi.hoisted(() => ({ resolvePlayback: vi.fn() }));

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ lessonsTable, modulesTable }));
vi.mock('#/db/admin', () => admin);
vi.mock('#/integrations/upstash/redis', () => ({ redis: redisMock }));
vi.mock('#/lib/video-providers/resolve.server', () => providers);

const { getLessonPlayback } = await import('#/db/lesson-playback');

const lessonRow = { videoProvider: 'mux', videoRef: 'ref-1', courseId: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  admin.resolveCourseProvider.mockResolvedValue({ keyId: 'k' });
});

describe('getLessonPlayback', () => {
  it('returns a cache hit without touching the database or writing again', async () => {
    const cached = {
      status: 'ready' as const,
      url: 'https://cdn/cached.m3u8',
      kind: 'hls' as const,
      expiresInSeconds: 60,
      poster: null,
      captions: null,
    };
    redisMock.get.mockResolvedValueOnce(cached);

    const result = await getLessonPlayback('l1');

    expect(result).toEqual(cached);
    expect(redisMock.get).toHaveBeenCalledWith('lesson-playback:l1');
    expect(db.select).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('does not cache a still-rendering result — it can change on its own', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    db.select.mockReturnValueOnce(makeChain([lessonRow]));
    providers.resolvePlayback.mockResolvedValueOnce({ status: 'rendering' });

    const result = await getLessonPlayback('l1');

    expect(result).toEqual({ status: 'rendering' });
    // The Critical this test guards: a pending result must never be written,
    // not written-with-a-wrong-TTL. `cacheWithRedis` could not express this
    // (its extractor's `null` fell back to a 6h default and `set` still ran).
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('does not cache a failed result either', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    db.select.mockReturnValueOnce(makeChain([lessonRow]));
    providers.resolvePlayback.mockResolvedValueOnce({ status: 'failed' });

    const result = await getLessonPlayback('l1');

    expect(result).toEqual({ status: 'failed' });
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('caches a ready result with a TTL derived from its own expiry, minus the 30s margin', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    db.select.mockReturnValueOnce(makeChain([lessonRow]));
    const ready = {
      status: 'ready' as const,
      url: 'https://cdn/v.mp4',
      kind: 'file' as const,
      expiresInSeconds: 90,
      poster: null,
      captions: null,
    };
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1');

    expect(result).toEqual(ready);
    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:l1',
      JSON.stringify(ready),
      { ex: 60 }, // 90 - 30
    );
  });

  it('clamps the TTL to at least 1s when expiresInSeconds is under the margin', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    db.select.mockReturnValueOnce(makeChain([lessonRow]));
    const ready = {
      status: 'ready' as const,
      url: 'https://cdn/v.mp4',
      kind: 'file' as const,
      expiresInSeconds: 10,
      poster: null,
      captions: null,
    };
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    await getLessonPlayback('l1');

    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:l1',
      JSON.stringify(ready),
      { ex: 1 },
    );
  });

  it('does not cache a ready result with no known expiry — no safe TTL to guess', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    db.select.mockReturnValueOnce(makeChain([lessonRow]));
    const ready = {
      status: 'ready' as const,
      url: 'https://cdn/v.mp4',
      kind: 'file' as const,
      expiresInSeconds: null,
      poster: 'https://cdn/p.jpg',
      captions: null,
    };
    providers.resolvePlayback.mockResolvedValueOnce(ready);

    const result = await getLessonPlayback('l1');

    expect(result).toEqual(ready);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('does not cache a null result (no such lesson, or no video/credentials configured)', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    db.select.mockReturnValueOnce(makeChain([])); // no matching lesson row

    const result = await getLessonPlayback('missing');

    expect(result).toBeNull();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('skipCache bypasses the read and re-resolves, even though a cache entry exists', async () => {
    // The exact scenario the recovery path exists for: a still-live cache
    // entry (e.g. the same stale URL a client just observed a 403 from)
    // must not be handed back again. `redisMock.get` deliberately has no
    // queued value here — asserting it is never even called (below) is a
    // stronger guarantee than stubbing it and hoping it's ignored.
    db.select.mockReturnValueOnce(makeChain([lessonRow]));
    const fresh = {
      status: 'ready' as const,
      url: 'https://cdn/fresh.m3u8',
      kind: 'hls' as const,
      expiresInSeconds: 3600,
      poster: null,
      captions: null,
    };
    providers.resolvePlayback.mockResolvedValueOnce(fresh);

    const result = await getLessonPlayback('l1', { skipCache: true });

    expect(result).toEqual(fresh);
    expect(redisMock.get).not.toHaveBeenCalled();
    // Still writes a fresh cache entry under the normal TTL rules.
    expect(redisMock.set).toHaveBeenCalledWith(
      'lesson-playback:l1',
      JSON.stringify(fresh),
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

    const result = await getLessonPlayback('l1', { skipCache: false });

    expect(result).toEqual(cached);
    expect(redisMock.get).toHaveBeenCalledWith('lesson-playback:l1');
    expect(db.select).not.toHaveBeenCalled();
  });
});
