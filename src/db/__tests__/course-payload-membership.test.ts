// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import type { Captured } from './support/capture-db';

/**
 * Task 4: the LEARNER-FACING payload reads "which modules are in this course"
 * from `course_modules` (the placement table) instead of `modules.course_id`.
 * Three read paths are pinned here — `getCourseDetails` and `getMyCourses`
 * (`#/db/course`) and `getCourseContentForAgent` (`#/db/course-content`) —
 * each on the exact join/where/order expression it handed the query builder,
 * rendered with the house `renderSql` and asserted `toBe` on the full text by
 * index. The mutant every one of these exists to catch is the half-migration:
 * a query that JOINS the placement table but still filters or orders on the
 * module row, which compiles, matches the backfilled data today, and drifts
 * the moment two courses order a shared module differently.
 *
 * `#/db` is one `captureDb` per file, so the capture arrays and result queue
 * are emptied per test. The real `#/db/schema` is loaded (so `eq`/`asc`
 * build real drizzle trees against the real column names); everything else
 * course.ts / course-content.ts drag in at import time is stubbed to a no-op,
 * never `importOriginal`ed.
 */
const cap = vi.hoisted(() => {
  const captured = {
    select: [] as unknown[],
    from: [] as unknown[],
    joins: [] as unknown[],
    joinOn: [] as unknown[],
    where: [] as unknown[],
    orderBy: [] as unknown[],
    groupBy: [] as unknown[],
  } satisfies Captured;
  return { captured, results: [] as unknown[][] };
});
vi.mock('#/db', async () => {
  const { captureDb } = await import('./support/capture-db');
  const { db, captured, results } = captureDb();
  Object.assign(cap.captured, captured);
  cap.results = results;
  return { db };
});
const membership = vi.hoisted(() => ({
  courseModuleIds: vi.fn(() => 'SUBQUERY'),
  getCourseModuleIds: vi.fn(async () => []),
}));
vi.mock('#/db/course-modules', () => membership);

// course.ts imports the schema and the redis cache through the `@/` alias.
// The schema is re-exported REAL through `#/` (same objects, so table
// identity survives); the cache wrapper is bypassed so no Redis client is
// constructed at module scope.
vi.mock('@/db/schema', () => vi.importActual('#/db/schema'));
vi.mock('@/integrations/upstash/redis', () => ({
  cacheWithRedis: (_prefix: string, fn: unknown) => fn,
}));
vi.mock('#/db/admin', () => ({
  getUserRoleNames: vi.fn().mockResolvedValue([]),
}));
vi.mock('#/db/course-last-viewed-batch', () => ({
  getLastViewedLessonIdsByCourse: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock('#/db/user-levels', () => ({
  getCurrentLevelsByCourse: vi.fn().mockResolvedValue(new Map()),
  getCurrentLevel: vi.fn().mockResolvedValue('basic'),
}));
vi.mock('#/db/course-staff', () => ({
  getStaffCourseIds: vi.fn().mockResolvedValue(new Set()),
  getStaffCourseSlugs: vi.fn().mockResolvedValue([]),
  isCourseStaff: vi.fn().mockResolvedValue(false),
}));
vi.mock('#/db/progress-components', () => ({
  progressComponentColumns: () => ({}),
  progressComponentGroupBy: [],
  toComponentFields: () => ({}),
}));
vi.mock('#/db/course-progress', () => ({ getCourseProgress: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  isSubscribedToCourseSlug: vi.fn().mockResolvedValue(false),
}));

const { getCourseDetails, getMyCourses, COURSE_DETAILS_CACHE_KEY } =
  await import('../course');
const { getCourseContentForAgent } = await import('../course-content');
const { courseModulesTable, modulesTable } = await import('#/db/schema');

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of Object.values(cap.captured)) list.length = 0;
  cap.results.length = 0;
});

const courseRow = {
  id: 7,
  name: 'ITPS UAS Remote',
  slug: 'itps-uas-remote',
  description: null,
  imageUrlAvif: null,
  imageUrlWebp: null,
};
const moduleRow = (id: number, rank: string) => ({
  id,
  name: `M${id}`,
  slug: `m${id}`,
  imageUrlAvif: null,
  imageUrlWebp: null,
  rank,
  requiredSubscriptions: [],
  sequentialLessons: true,
});

/**
 * `getCourseDetails` returns `null` when the course lookup resolves `[]`, so
 * the first awaited chain must hand back course rows for control flow to
 * reach the lesson query. Rows carry the placement's rank alongside the
 * module row, which is what step 3 of `getCourseDetails` destructures.
 */
function seedCourseWithModules(
  modules: { module: ReturnType<typeof moduleRow>; rank: string }[] = [],
) {
  cap.results.push(
    modules.length === 0
      ? [{ course: courseRow, module: null, rank: null }]
      : modules.map((m) => ({ course: courseRow, ...m })),
  );
}

describe('getCourseDetails', () => {
  /**
   * Capture order: [0] the course+modules lookup, [1] the lesson query. The
   * lesson query's WHERE must be handed the membership helper's subquery for
   * this course's id — `inArray(module_lessons.module_id, <helper>)`. The
   * helper is mocked to return a sentinel, so the rendered parameter IS the
   * proof the consumer received what the helper produced, not merely that the
   * helper was called somewhere.
   */
  it('scopes lessons through the membership helper for the seeded course', async () => {
    seedCourseWithModules();
    await getCourseDetails('itps-uas-remote');

    expect(membership.courseModuleIds).toHaveBeenCalledWith(7);
    expect(renderSql(cap.captured.where[1] as SQL)).toBe(
      '"module_lessons"."module_id" in $1',
    );
    expect(renderSqlParams(cap.captured.where[1] as SQL)).toEqual(['SUBQUERY']);
  });

  /**
   * The course+modules lookup joins THROUGH the placement: courses ->
   * course_modules (on the placement's course id) -> modules (on the
   * placement's module id). Both LEFT, so a course with no placements still
   * resolves a course row rather than `null`.
   */
  it('joins modules through course_modules, not modules.course_id', async () => {
    seedCourseWithModules();
    await getCourseDetails('itps-uas-remote');

    expect(cap.captured.joins[0]).toBe(courseModulesTable);
    expect(renderSql(cap.captured.joinOn[0] as SQL)).toBe(
      '"course_modules"."course_id" = "courses"."id"',
    );
    expect(cap.captured.joins[1]).toBe(modulesTable);
    expect(renderSql(cap.captured.joinOn[1] as SQL)).toBe(
      '"modules"."id" = "course_modules"."module_id"',
    );
  });

  /**
   * The payload's module order and each module's `rank` come from the
   * PLACEMENT, not the module row. With `modules.rank` and the placement's
   * rank deliberately disagreeing, a payload still sorted by the spread
   * `...module` rank (the mutant) puts the modules in the wrong order and
   * reports the wrong number.
   */
  it("orders and values modules by the placement's rank, not modules.rank", async () => {
    seedCourseWithModules([
      // modules.rank says 20, 10 — the placement says the opposite.
      { module: moduleRow(1, '20'), rank: '1' },
      { module: moduleRow(2, '10'), rank: '2' },
    ]);
    const details = await getCourseDetails('itps-uas-remote');

    expect(details?.modules.map((m) => m.id)).toEqual([1, 2]);
    expect(details?.modules.map((m) => m.rank)).toEqual(['1', '2']);
  });
});

describe('getMyCourses', () => {
  /**
   * Join order: [0] courses INNER on subscriptions, [1] course_modules LEFT
   * on the course, [2] modules LEFT on the placement's module id, then
   * module_lessons/lessons as before. ORDER BY [2] is the placement's rank —
   * the mutant keeps `asc(modules.rank)` after switching the join.
   */
  it('joins through course_modules and orders by the placement rank', async () => {
    await getMyCourses('u1');

    expect(cap.captured.joins[1]).toBe(courseModulesTable);
    expect(renderSql(cap.captured.joinOn[1] as SQL)).toBe(
      '"course_modules"."course_id" = "courses"."id"',
    );
    expect(cap.captured.joins[2]).toBe(modulesTable);
    expect(renderSql(cap.captured.joinOn[2] as SQL)).toBe(
      '"modules"."id" = "course_modules"."module_id"',
    );
    expect(renderSql(cap.captured.orderBy[2] as SQL)).toBe(
      '"course_modules"."rank" asc',
    );
    expect(renderSql(cap.captured.orderBy[3] as SQL)).toBe(
      '"module_lessons"."rank" asc',
    );
  });
});

describe('getCourseContentForAgent', () => {
  /**
   * Same shape, same mutant: [0] course_modules LEFT on the course, [1]
   * modules LEFT on the placement's module id; ORDER BY the placement's
   * rank first, then the lesson placement's.
   */
  it('joins through course_modules and orders by the placement rank', async () => {
    await getCourseContentForAgent('itps-uas-remote', { userId: 'u1' });

    expect(cap.captured.joins[0]).toBe(courseModulesTable);
    expect(renderSql(cap.captured.joinOn[0] as SQL)).toBe(
      '"course_modules"."course_id" = "courses"."id"',
    );
    expect(cap.captured.joins[1]).toBe(modulesTable);
    expect(renderSql(cap.captured.joinOn[1] as SQL)).toBe(
      '"modules"."id" = "course_modules"."module_id"',
    );
    expect(renderSql(cap.captured.orderBy[0] as SQL)).toBe(
      '"course_modules"."rank" asc',
    );
    expect(renderSql(cap.captured.orderBy[1] as SQL)).toBe(
      '"module_lessons"."rank" asc',
    );
  });
});

/**
 * The payload is cached under a versioned key. A reader holding a v4 entry
 * built from `modules.course_id` would keep being served it for the full 6h
 * TTL, so the key must move in the same commit as the query — exactly the
 * reasoning the v2→v3 and v3→v4 bumps already record.
 *
 * Mutant this catches: the query switched and the key left alone. Invisible
 * to every test that does not read the key, and it makes the rollout
 * silently partial for six hours.
 */
it('bumps the cached payload key', () => {
  expect(COURSE_DETAILS_CACHE_KEY).toBe('course-details-v5');
});
