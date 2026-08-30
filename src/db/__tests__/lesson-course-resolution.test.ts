// @vitest-environment node
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectSqlTokens } from '#/db/__tests__/sql-tokens';

// Task 5a moves "which course does this lesson belong to" onto placements
// (`module_lessons`) instead of the legacy `lessons.module_id`. This file
// exercises both:
//  - the rewritten `#/db/lesson-access` readers directly (real module, run
//    against a stubbed `#/db` + `#/db/schema`), and
//  - one `#/db/admin` mutation, to prove the cache-invalidation bug is fixed:
//    a lesson taught by several courses must invalidate EVERY one of them,
//    not an arbitrary single slug.
//
// `#/db/lesson-access` and `#/db/placements` are deliberately left UNMOCKED
// (unlike admin-course-cache-invalidation.test.ts) so `#/db/admin`'s real
// call into `getCourseSlugsForLessonId` is actually exercised — that's the
// function under test for the regression case. Everything both modules
// import is rebuilt here as real `pgTable` stubs (never `importOriginal` —
// see memory: vitest can't resolve @/, use #/).
const coursesTable = pgTable('courses', {
  id: integer('id').primaryKey(),
  name: text('name'),
  slug: text('slug'),
  description: text('description'),
  imageUrlAvif: text('image_url_avif'),
  imageUrlWebp: text('image_url_webp'),
  updatedAt: timestamp('updated_at'),
  onboardingQuestions: jsonb('onboarding_questions'),
});
const courseOrgsTable = pgTable('course_orgs', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  orgId: integer('org_id'),
  personaId: integer('persona_id'),
  updatedAt: timestamp('updated_at'),
});
const modulesTable = pgTable('modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  name: text('name'),
  slug: text('slug'),
  imageUrlAvif: text('image_url_avif'),
  imageUrlWebp: text('image_url_webp'),
  rank: text('rank'),
  requiredSubscriptions: jsonb('required_subscriptions'),
  updatedAt: timestamp('updated_at'),
});
const moduleLessonsTable = pgTable('module_lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  lessonId: integer('lesson_id'),
  rank: numeric('rank'),
  dependsOn: jsonb('depends_on'),
});
const lessonDependenciesTable = pgTable('lesson_dependencies', {
  id: integer('id').primaryKey(),
  lessonId: integer('lesson_id'),
  dependsOn: jsonb('depends_on'),
});
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  name: text('name'),
  slug: text('slug'),
  rank: text('rank'),
  isAvailable: boolean('is_available'),
  hasDebrief: boolean('has_debrief'),
  needsVideoWatch: boolean('needs_video_watch'),
  requiredSubscriptions: jsonb('required_subscriptions'),
  videoId: text('video_id'),
  videoProvider: text('video_provider'),
  videoRef: text('video_ref'),
  updatedAt: timestamp('updated_at'),
});
const courseSubscriptionsTable = pgTable('course_subscriptions', {
  id: integer('id').primaryKey(),
  userId: text('user_id'),
  courseId: integer('course_id'),
});
const courseVideoProvidersTable = pgTable('course_video_providers', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  provider: text('provider'),
  secrets: jsonb('secrets'),
  lastValidatedAt: timestamp('last_validated_at'),
  updatedAt: timestamp('updated_at'),
});
const userProfileRolesTable = pgTable('user_profile_roles', {
  userProfileId: integer('user_profile_id'),
  roleId: integer('role_id'),
});
const userProfileTable = pgTable('user_profile', {
  id: integer('id').primaryKey(),
  userId: text('user_id'),
});
const userRolesTable = pgTable('user_roles', {
  id: integer('id').primaryKey(),
  name: text('name'),
});

/**
 * Chainable stub for a single drizzle query, ignoring its arguments — copied
 * from `admin-course-cache-invalidation.test.ts` / `placements.test.ts`. Good
 * enough to drive control flow, but it CANNOT catch a wrong join or a wrong
 * `WHERE`/`ORDER BY` target, since every builder method just returns the same
 * object regardless of what it was called with.
 */
function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    values: (v: unknown) => {
      chain.valuesArg = v;
      return chain;
    },
    valuesArg: undefined as unknown,
    set: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    limit: () => chain,
    onConflictDoUpdate: () => chain,
    onConflictDoNothing: () => chain,
    returning: () => Promise.resolve(result),
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders (awaitable without a terminal `.returning()`/`.orderBy()`)
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

/**
 * Variant of `makeChain` that records every argument passed to `.orderBy()`.
 * Needed for the determinism test: `makeChain` above swallows its arguments,
 * so it cannot prove `getCourseSlugForLessonId` actually asked Postgres to
 * order by `course_id` — only that its control flow reached `.limit(1)`. A
 * mutant that dropped the `.orderBy(...)` call entirely (or ordered by the
 * wrong column) would still pass every assertion built on plain `makeChain`.
 */
function makeOrderedChain(result: unknown, orderByCalls: unknown[]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: (col: unknown) => {
      orderByCalls.push(col);
      return chain;
    },
    limit: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: see makeChain above
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

/**
 * Variant of `makeChain` that records every `(table, condition)` pair passed
 * to `.innerJoin()`. Needed to prove `getCourseSlugsForLessonId` actually
 * hops through `module_lessons` rather than the legacy `lessons.module_id`
 * path: `makeChain` discards its arguments entirely (see its own doc comment
 * above), so a mutant that put the OLD join back —
 * `.innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))` —
 * would satisfy every assertion built on plain `makeChain` or
 * `makeOrderedChain`. Pair with `collectSqlTokens` below to inspect what a
 * captured condition actually references.
 */
function makeJoinCapturingChain(
  result: unknown,
  joinCalls: Array<[table: unknown, condition: unknown]>,
) {
  const chain = {
    from: () => chain,
    innerJoin: (table: unknown, condition: unknown) => {
      joinCalls.push([table, condition]);
      return chain;
    },
    where: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: see makeChain above
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const courseCache = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
const lessonPlaybackCache = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
const synthesiaThumbnailsCache = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
const resolveServer = vi.hoisted(() => ({
  resolvePlayback: vi.fn(),
  validateCredentials: vi.fn(),
}));
const blob = vi.hoisted(() => ({
  del: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue({ blobs: [], hasMore: false }),
}));

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({
  courseOrgsTable,
  coursesTable,
  courseSubscriptionsTable,
  courseVideoProvidersTable,
  lessonDependenciesTable,
  lessonsTable,
  moduleLessonsTable,
  modulesTable,
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
}));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: Object.assign(vi.fn(), courseCache),
}));
vi.mock('#/db/lesson-playback', () => ({
  getLessonPlayback: Object.assign(vi.fn(), lessonPlaybackCache),
}));
vi.mock('@vercel/blob', () => blob);
vi.mock('#/lib/video-providers/resolve.server', () => resolveServer);
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: Object.assign(vi.fn(), synthesiaThumbnailsCache),
}));

const {
  getCourseIdForLessonId,
  getCourseSlugForLesson,
  getCourseSlugForLessonId,
  getCourseSlugsForLessonId,
} = await import('#/db/lesson-access');
const { updateLessonName } = await import('#/db/admin');

beforeEach(() => {
  vi.clearAllMocks();
  courseCache.invalidate.mockResolvedValue(undefined);
});

describe('getCourseSlugsForLessonId', () => {
  // Mutant this catches: reverting to the pre-Task-5a single-slug query (or
  // dropping the `[...new Set(...)]` dedupe) — either would leave duplicate
  // slugs in the array, or only the first course.
  it('returns every course slug teaching the lesson, deduplicated', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        { courseSlug: 'flight-basics' },
        { courseSlug: 'aerobatics' },
        { courseSlug: 'flight-basics' },
      ]),
    );

    expect(await getCourseSlugsForLessonId(9)).toEqual([
      'flight-basics',
      'aerobatics',
    ]);
  });

  // Mutant this catches: a fallback that turns an empty result into `null`,
  // `undefined`, or the array `[null]` instead of `[]`.
  it('returns an empty array for a lesson with no placements', async () => {
    db.select.mockReturnValueOnce(makeChain([]));

    expect(await getCourseSlugsForLessonId(9)).toEqual([]);
  });

  // Mutant this catches: putting the OLD join back —
  // `.innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))`
  // instead of hopping through `module_lessons` — which every other test in
  // this describe block would still pass, since `makeChain` ignores its
  // arguments entirely (see its doc comment) and only cares that SOME chain
  // of calls reaches `.where()`. This test captures the actual
  // `(table, condition)` pairs passed to `.innerJoin()` and inspects them.
  it('joins through module_lessons.lesson_id, not the legacy lessons.module_id path', async () => {
    const joinCalls: Array<[unknown, unknown]> = [];
    db.select.mockReturnValueOnce(
      makeJoinCapturingChain([{ courseSlug: 'flight-basics' }], joinCalls),
    );

    await getCourseSlugsForLessonId(9);

    // Direct reference equality on the table argument — the strongest proof
    // available that this specific join targets `module_lessons` (the const
    // object mocked in for `#/db/schema` above), not merely a table that
    // happens to share a column name.
    const moduleLessonsJoin = joinCalls.find(
      ([table]) => table === moduleLessonsTable,
    );
    expect(moduleLessonsJoin).toBeDefined();
    // And the condition on that join actually references `lesson_id` — the
    // real column name is unique to `module_lessons` among every stub table
    // in this file, so its presence pins the condition to
    // `moduleLessonsTable.lessonId`, not some other column.
    const tokens = collectSqlTokens(moduleLessonsJoin?.[1]);
    expect(tokens).toContain('lesson_id');
  });
});

describe('getCourseSlugForLessonId determinism', () => {
  // Mutant this catches: dropping `.orderBy(modulesTable.courseId)` (or
  // ordering by the wrong column) from `getCourseSlugForLessonId`. That
  // mutant is "correct-shaped" — it still resolves *a* slug and still
  // type-checks — but with placements in several courses, which slug comes
  // back would depend on Postgres's unspecified row order and could differ
  // between calls. `makeChain` alone can't see this (it ignores `.orderBy`'s
  // argument entirely), so this test uses `makeOrderedChain` to capture what
  // was actually passed.
  it('orders by course id and returns the same slug across repeated calls', async () => {
    const orderByCalls: unknown[] = [];
    db.select
      .mockReturnValueOnce(
        makeOrderedChain([{ courseSlug: 'flight-basics' }], orderByCalls),
      )
      .mockReturnValueOnce(
        makeOrderedChain([{ courseSlug: 'flight-basics' }], orderByCalls),
      );

    const first = await getCourseSlugForLessonId(9);
    const second = await getCourseSlugForLessonId(9);

    expect(first).toBe('flight-basics');
    expect(second).toBe('flight-basics');
    expect(orderByCalls).toHaveLength(2);
    for (const col of orderByCalls) {
      expect((col as { name: string }).name).toBe('course_id');
    }
  });
});

describe('getCourseSlugForLesson determinism', () => {
  // `getCourseSlugForLesson` decides what a learner may see (it backs
  // `evaluateLessonGate` via `course-content.ts`), and until this test no
  // real invocation of it was ever exercised — every gating test stubs it
  // out with `vi.fn()`. Same mutant as `getCourseSlugForLessonId`'s
  // determinism test: dropping `.orderBy(modulesTable.courseId)` is
  // "correct-shaped" (still resolves *a* course, still type-checks) but
  // would make which course comes back depend on Postgres's unspecified row
  // order when a lesson is taught by several.
  it('orders by course id and returns the same result across repeated calls', async () => {
    const orderByCalls: unknown[] = [];
    const row = {
      courseSlug: 'flight-basics',
      courseId: 3,
      isAvailable: true,
    };
    db.select
      .mockReturnValueOnce(makeOrderedChain([row], orderByCalls))
      .mockReturnValueOnce(makeOrderedChain([row], orderByCalls));

    const first = await getCourseSlugForLesson('stall-recovery');
    const second = await getCourseSlugForLesson('stall-recovery');

    expect(first).toEqual(row);
    expect(second).toEqual(row);
    expect(orderByCalls).toHaveLength(2);
    for (const col of orderByCalls) {
      expect((col as { name: string }).name).toBe('course_id');
    }
  });
});

describe('getCourseIdForLessonId determinism', () => {
  // Same mutant and same rationale as the two determinism tests above.
  // `getCourseIdForLessonId` backs the five admin lesson routes' permission
  // guards (a later task replaces those guards; not in scope here — see the
  // fix-round-1 report), but its determinism is still worth pinning now: an
  // authorization check that answers differently across calls for the same
  // lesson is its own kind of bug even before that guard is rewritten.
  it('orders by course id and returns the same id across repeated calls', async () => {
    const orderByCalls: unknown[] = [];
    db.select
      .mockReturnValueOnce(makeOrderedChain([{ courseId: 3 }], orderByCalls))
      .mockReturnValueOnce(makeOrderedChain([{ courseId: 3 }], orderByCalls));

    const first = await getCourseIdForLessonId(9);
    const second = await getCourseIdForLessonId(9);

    expect(first).toBe(3);
    expect(second).toBe(3);
    expect(orderByCalls).toHaveLength(2);
    for (const col of orderByCalls) {
      expect((col as { name: string }).name).toBe('course_id');
    }
  });
});

describe('bug regression: invalidating every course a lesson is placed in', () => {
  // This is the bug Task 5a fixes: with one lesson taught by three courses,
  // an admin edit used to resolve and invalidate only ONE course's cache
  // (whichever `getCourseSlugForLessonId` happened to return), leaving the
  // other two serving stale content until the 6h TTL expired.
  //
  // Mutant this catches: reverting `updateLessonName`'s invalidation call to
  // `invalidateCourseDetailsCache(await getCourseSlugForLessonId(lessonId))`
  // (the pre-fix single-slug call). Under that mutant, `db.select`'s three
  // mocked rows still resolve fine, but only the FIRST slug is ever passed to
  // `invalidate` — so `toHaveBeenCalledTimes(3)` fails (actual: 1) and the
  // per-slug assertion below fails too.
  it('updateLessonName invalidates the cache for every course teaching the lesson', async () => {
    db.update.mockReturnValueOnce(makeChain([{ id: 9, name: 'New name' }]));
    db.select.mockReturnValueOnce(
      makeChain([
        { courseSlug: 'flight-basics' },
        { courseSlug: 'aerobatics' },
        { courseSlug: 'instrument-rating' },
      ]),
    );

    await updateLessonName(9, 'New name');

    expect(courseCache.invalidate).toHaveBeenCalledTimes(3);
    const invalidatedSlugs = courseCache.invalidate.mock.calls
      .map((call) => call[0])
      .sort();
    expect(invalidatedSlugs).toEqual([
      'aerobatics',
      'flight-basics',
      'instrument-rating',
    ]);
  });
});
