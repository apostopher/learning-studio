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
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
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
// Task 7: membership. `getCourseSlugsForLessonId` resolves the courses that
// TEACH a lesson through this placement table, not through the module row's
// owner (`modules.course_id`).
const courseModulesTable = pgTable('course_modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  moduleId: integer('module_id'),
  rank: numeric('rank'),
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
 * Variant of `makeChain` that records every `(table, condition)` pair passed
 * to `.innerJoin()`. Needed to prove `getCourseSlugsForLessonId` actually
 * hops through `module_lessons` rather than the legacy `lessons.module_id`
 * path: `makeChain` discards its arguments entirely (see its own doc comment
 * above), so a mutant that put the OLD join back —
 * `.innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))` —
 * would satisfy every assertion built on plain `makeChain`. Pair with
 * `collectSqlTokens` below to inspect what a captured condition actually
 * references.
 *
 * `orderBy`/`limit` chain through untouched so the same capturing chain
 * keeps working for any reader that terminates on `.limit(1)`.
 *
 * `whereCalls` (fix round 1, 2a): optional, defaults to a throwaway array —
 * before this parameter existed, `.where()` was a bare no-op here, so no
 * test in this file asserted what any of these functions' `.where()`
 * actually scoped by. A mutant swapping the WHERE's column (e.g.
 * `eq(moduleLessonsTable.lessonId, lessonId)` instead of `eq(lessonsTable.id,
 * lessonId)`) is "correct-shaped" — still an integer equality on a real
 * column — but silently changes which rows the query can even match, and
 * passed the whole file undetected.
 */
function makeJoinCapturingChain(
  result: unknown,
  joinCalls: Array<[table: unknown, condition: unknown]>,
  whereCalls: unknown[] = [],
) {
  const chain = {
    from: () => chain,
    innerJoin: (table: unknown, condition: unknown) => {
      joinCalls.push([table, condition]);
      return chain;
    },
    where: (condition: unknown) => {
      whereCalls.push(condition);
      return chain;
    },
    orderBy: () => chain,
    limit: () => chain,
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
  courseModulesTable,
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

const { getCourseSlugsForLessonId } = await import('#/db/lesson-access');
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

// Task 5e, Part 2a: before this block, the `collectSqlTokens` check above
// was the only join-argument assertion on this
// `lessons -> module_lessons -> … -> courses` hop, and it only proves
// PRESENCE: a PARTIAL revert of any one of the three joins back to the
// legacy path — e.g. `.innerJoin(modulesTable, eq(modulesTable.id,
// lessonsTable.moduleId))`, skipping module_lessons entirely for that one
// hop — was "correct-shaped" (still an integer FK join, still compiles) but
// silently reverted the function's course resolution to the legacy
// single-valued `lessons.module_id`. Every other test for it builds on
// `makeChain`, which discards join arguments (see its doc comment), so none
// of them could catch that. This test captures every `(table, condition)`
// pair passed to `.innerJoin()`, in call order, and renders each condition
// to its exact SQL text — pinning both the join order and which columns are
// paired on each hop.
//
// (The single-course siblings that shared this hop — the learner gate's
// slug inferrer and the admin path's id/slug-by-lesson-id inferrers — were
// the ones pinned here until Tasks 6a/6b deleted them: each picked the
// lowest course id among those teaching a lesson, and the routes now name
// the course instead. See lesson-course-scoped-reads.test.ts. The pin moved
// to the surviving plural reader, which walks the identical hop.)
//
// Task 7: the third hop is MEMBERSHIP. "Every course that teaches this
// lesson" is every course the lesson's module is PLACED in — a
// `course_modules` row — not the one course that OWNS the module
// (`modules.course_id`). Mutant: the shipped Task 6b-era shape,
// `.innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
// .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))` —
// same row count today (every module is placed in its owner), and the day a
// module is placed in a second course, editing one of its lessons leaves
// that course's details cache stale. The `modules` table must not appear in
// the chain at all: there is nothing on the module row this reader needs.
describe('join argument pinning: lessons -> module_lessons -> course_modules -> courses', () => {
  const expectedJoinChain = (
    joinCalls: Array<[table: unknown, condition: unknown]>,
  ) => {
    expect(joinCalls).toHaveLength(3);
    expect(joinCalls[0][0]).toBe(moduleLessonsTable);
    expect(renderSql(joinCalls[0][1] as never)).toBe(
      '"module_lessons"."lesson_id" = "lessons"."id"',
    );
    expect(joinCalls[1][0]).toBe(courseModulesTable);
    expect(renderSql(joinCalls[1][1] as never)).toBe(
      '"course_modules"."module_id" = "module_lessons"."module_id"',
    );
    expect(joinCalls[2][0]).toBe(coursesTable);
    expect(renderSql(joinCalls[2][1] as never)).toBe(
      '"courses"."id" = "course_modules"."course_id"',
    );
    expect(joinCalls.map(([table]) => table)).not.toContain(modulesTable);
  };

  // Mutant: the partial revert above, applied to any one of the three joins.
  it('getCourseSlugsForLessonId joins module_lessons, then course_modules, then courses, each correctly paired', async () => {
    const joinCalls: Array<[unknown, unknown]> = [];
    const whereCalls: unknown[] = [];
    db.select.mockReturnValueOnce(
      makeJoinCapturingChain(
        [{ courseSlug: 'flight-basics' }],
        joinCalls,
        whereCalls,
      ),
    );

    await getCourseSlugsForLessonId(9);

    expectedJoinChain(joinCalls);
    // Mutant: `eq(moduleLessonsTable.lessonId, lessonId)` or any other
    // column swap — "correct-shaped" (still an equality on a real column)
    // but matches an entirely different row set.
    expect(whereCalls).toHaveLength(1);
    expect(renderSql(whereCalls[0] as never)).toBe('"lessons"."id" = $1');
    expect(renderSqlParams(whereCalls[0] as never)).toEqual([9]);
  });
});

describe('bug regression: invalidating every course a lesson is placed in', () => {
  // This is the bug Task 5a fixes: with one lesson taught by three courses,
  // an admin edit used to resolve and invalidate only ONE course's cache
  // (whichever slug the since-deleted single-course lookup happened to
  // return), leaving the other two serving stale content until the 6h TTL
  // expired.
  //
  // Mutant this catches: reverting `updateLessonName`'s invalidation call to
  // a single-slug `invalidateCourseDetailsCache(await <one slug>)` (the
  // pre-fix shape). Under that mutant, `db.select`'s three
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
