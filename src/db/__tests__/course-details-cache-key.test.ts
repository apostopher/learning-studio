// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// getCourseDetailsWithCache pulls in the real drizzle client, the real
// schema (which has its own `@/types` value import vitest cannot resolve —
// see memory: vitest can't resolve @/, use #/), `#/db/admin` (which in turn
// reaches into @vercel/blob, #/env, and video-provider resolution), and
// #/db/course-last-viewed-batch. None of that machinery is exercised by
// this test — it only needs the module to load and its `redis.get` call to
// short-circuit on a cache "hit" before any of it runs — so, following the
// repo's established "fully stub, never importOriginal" pattern (see
// src/db/__tests__/course-content-gating.test.ts), everything is stubbed.
const redisClient = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => redisClient },
}));
// db/course.ts imports `cacheWithRedis` via the `@/` alias, which (per
// memory: vitest can't resolve @/, use #/) vitest cannot load directly even
// though `vi.mock('@/...')` factories work fine. Re-export the REAL
// implementation through the `#/` alias, which does resolve — this test
// wants the actual key-building logic, not a re-mocked stand-in for it.
vi.mock('@/integrations/upstash/redis', () =>
  vi.importActual('#/integrations/upstash/redis'),
);
vi.mock('#/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({
  coursesTable: {},
  modulesTable: {},
  lessonsTable: {},
  lessonDependenciesTable: {},
  moduleDependenciesTable: {},
  orgLessonsTable: {},
  orgsTable: {},
  videoProgressTable: {},
  courseLastViewedTable: {},
}));
vi.mock('#/db/admin', () => ({ getUserRoleNames: vi.fn() }));
vi.mock('#/db/course-last-viewed-batch', () => ({
  getLastViewedLessonIdsByCourse: vi.fn(),
}));

const { getCourseDetailsWithCache } = await import('#/db/course');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCourseDetailsWithCache cache key', () => {
  // Regression guard for the class of bug in review Finding 1: `hasVideo` is
  // a DERIVED field baked into this cached payload at write time. A cached
  // entry is raw JSON with no shape/schema tag of its own, so when the
  // return shape changes (as it just did, adding `hasVideo`), any entry
  // written under the OLD key before the change deserialises silently
  // missing the new field — `isLessonSatisfied`'s `if (!lesson.hasVideo)
  // return true` would then treat every lesson as satisfied, opening every
  // prerequisite gate platform-wide for up to the cache's 6h TTL. Bumping
  // the key prefix on every shape change is what prevents that: a stale
  // entry becomes unreachable under the new key instead of being read back.
  // This test proves the real exported cache reads/writes under the CURRENT
  // versioned key — not merely that a bare string constant exists somewhere.
  it('reads under the versioned key, so a pre-migration cache entry can never be read back as this shape', async () => {
    // A "hit" — whatever is returned here never has to be a real course
    // shape, since the point is only to observe which key `redis.get` was
    // asked for before this resolves and short-circuits.
    redisClient.get.mockResolvedValue({ id: 1, modules: [] });

    await getCourseDetailsWithCache('flight-basics');

    expect(redisClient.get).toHaveBeenCalledWith(
      'course-details-v2:"flight-basics"',
    );
    // The pre-`hasVideo` key. If this were ever called, a same-named entry
    // written before this migration (missing `hasVideo`) would be served as
    // if it were current.
    expect(redisClient.get).not.toHaveBeenCalledWith(
      'course-details:"flight-basics"',
    );
  });
});
