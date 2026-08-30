// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  PgDialect,
  pgTable,
  text,
} from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task 5c moves the LEARNER-FACING read path onto placements
 * (`module_lessons`): `getCourseDetails` (`#/db/course`), `getMyCourses`
 * (`#/db/course`), `getCourseContentForAgent` (`#/db/course-content`) and
 * `getCourseProgress` (`#/db/course-progress`) all now reach a lesson's
 * position/rank/prerequisites through its placement rather than the legacy
 * single-valued `lessons.module_id`/`lessons.rank`/`lesson_dependencies`.
 *
 * Real `pgTable` stubs (not plain object mocks) so `eq`/`and`/`asc`/`inArray`
 * build REAL drizzle condition trees against them — house pattern from
 * `library-placement-scoping.test.ts`: a chainable stub returns rows
 * regardless of the query built, so anything about which tables are joined,
 * in what order, and with what condition has to be proven by rendering the
 * captured condition to exact SQL text with `PgDialect`, never by asserting
 * on canned rows.
 *
 * `#/db`, `@/db`, `#/db/schema` and `@/db/schema` are ALL mocked to the same
 * hoisted `db`/table objects — course.ts and course-progress.ts import via
 * `@/db`(`.`)/`@/db/schema`, course-content.ts via `#/db`/`#/db/schema`, and
 * mocking every alias that resolves to the same file is cheap insurance
 * against relying on cross-alias resolution normalisation (see memory:
 * vitest can't resolve @/, use #/ — `vi.mock('@/...')` factories DO work,
 * but which alias a given import actually needs is easy to get wrong).
 * Every other collaborator (admin roles, staff lookups, levels, the last-
 * viewed pointer, the progress-component columns, redis) is stubbed to a
 * no-op purely so the real modules under test can load and run to
 * completion under vitest — none of it is exercised by the assertions here.
 */

const coursesTable = pgTable('courses', {
  id: integer('id').primaryKey(),
  name: text('name'),
  slug: text('slug'),
});
const modulesTable = pgTable('modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  name: text('name'),
  slug: text('slug'),
  imageUrlAvif: text('image_url_avif'),
  imageUrlWebp: text('image_url_webp'),
  rank: numeric('rank'),
  requiredSubscriptions: jsonb('required_subscriptions'),
  sequentialLessons: boolean('sequential_lessons'),
});
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  name: text('name'),
  slug: text('slug'),
  rank: numeric('rank'),
  isAvailable: boolean('is_available'),
  hasDebrief: boolean('has_debrief'),
  needsVideoWatch: boolean('needs_video_watch'),
  requiredSubscriptions: jsonb('required_subscriptions'),
  otherVideoIds: jsonb('other_video_ids'),
  videoProvider: text('video_provider'),
  videoRef: text('video_ref'),
  levels: jsonb('levels'),
});
const moduleLessonsTable = pgTable('module_lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  lessonId: integer('lesson_id'),
  rank: numeric('rank'),
  dependsOn: jsonb('depends_on'),
});
const moduleDependenciesTable = pgTable('module_dependencies', {
  moduleId: integer('module_id'),
  dependsOn: jsonb('depends_on'),
});
const orgLessonsTable = pgTable('org_lessons', {
  lessonId: integer('lesson_id'),
  orgId: integer('org_id'),
});
const orgsTable = pgTable('orgs', {
  id: integer('id').primaryKey(),
  name: text('name'),
});
const courseSubscriptionsTable = pgTable('course_subscriptions', {
  userId: text('user_id'),
  courseId: integer('course_id'),
});
const videoProgressTable = pgTable('videos_progress', {
  userId: text('user_id'),
  lessonId: integer('lesson_id'),
  progress: integer('progress'),
});
const lessonMaterialProgressTable = pgTable('lesson_material_progress', {
  userId: text('user_id'),
  lessonSlug: text('lesson_slug'),
});
const lessonMaterialTable = pgTable('lesson_material', {
  lessonSlug: text('lesson_slug'),
  text: text('text'),
  proTips: text('pro_tips'),
});

/** Same chainable stub as admin-course-cache-invalidation.test.ts. */
function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

type JoinCalls = {
  innerJoin: Array<[table: unknown, condition: SQL]>;
  leftJoin: Array<[table: unknown, condition: SQL]>;
  where: SQL[];
  orderBy: unknown[][];
};

const newJoinCalls = (): JoinCalls => ({
  innerJoin: [],
  leftJoin: [],
  where: [],
  orderBy: [],
});

/**
 * Variant of `makeChain` that records every `(table, condition)` pair passed
 * to `.innerJoin()`/`.leftJoin()`, every condition passed to `.where()`, and
 * every argument list passed to `.orderBy()`, in call order. Modelled on
 * `makeCapturingChain` in `library-placement-scoping.test.ts`.
 */
function makeCapturingChain(result: unknown, calls: JoinCalls) {
  const chain = {
    from: () => chain,
    innerJoin: (table: unknown, condition: SQL) => {
      calls.innerJoin.push([table, condition]);
      return chain;
    },
    leftJoin: (table: unknown, condition: SQL) => {
      calls.leftJoin.push([table, condition]);
      return chain;
    },
    where: (condition: SQL) => {
      calls.where.push(condition);
      return chain;
    },
    groupBy: () => chain,
    orderBy: (...args: unknown[]) => {
      calls.orderBy.push(args);
      return chain;
    },
    // biome-ignore lint/suspicious/noThenProperty: see makeChain above
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const dialect = new PgDialect();
/** Render a captured drizzle condition to its exact parameterized SQL text. */
function render(condition: SQL): string {
  return dialect.sqlToQuery(condition).sql;
}

const db = vi.hoisted(() => ({ select: vi.fn() }));
const schema = {
  coursesTable,
  modulesTable,
  lessonsTable,
  moduleLessonsTable,
  moduleDependenciesTable,
  orgLessonsTable,
  orgsTable,
  courseSubscriptionsTable,
  videoProgressTable,
  lessonMaterialProgressTable,
  lessonMaterialTable,
};

vi.mock('#/db', () => ({ db }));
vi.mock('@/db', () => ({ db }));
vi.mock('#/db/schema', () => schema);
vi.mock('@/db/schema', () => schema);
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
vi.mock('#/db/lesson-access', () => ({
  isSubscribedToCourseSlug: vi.fn().mockResolvedValue(false),
}));

const { getCourseDetails, getMyCourses } = await import('#/db/course');
const { getCourseProgress } = await import('#/db/course-progress');
const { getCourseContentForAgent } = await import('#/db/course-content');

beforeEach(() => {
  db.select.mockReset();
});

const courseWithModuleRow = {
  course: { id: 1, name: 'Flight Basics', slug: 'flight-basics' },
  module: {
    id: 10,
    courseId: 1,
    name: 'M1',
    slug: 'm1',
    imageUrlAvif: null,
    imageUrlWebp: null,
    rank: '1',
    requiredSubscriptions: [],
    sequentialLessons: true,
  },
};

const lessonRow = (opts: {
  id: number;
  slug: string;
  lessonRank: string;
  placementRank: string;
  dependsOn?: { lessonSlug: string }[];
}) => ({
  lesson: {
    id: opts.id,
    moduleId: 10,
    name: opts.slug,
    slug: opts.slug,
    rank: opts.lessonRank,
    isAvailable: true,
    hasDebrief: false,
    needsVideoWatch: true,
    requiredSubscriptions: [],
    otherVideoIds: [],
    videoProvider: null,
    videoRef: null,
    levels: [],
  },
  placement: {
    id: opts.id,
    moduleId: 10,
    lessonId: opts.id,
    rank: opts.placementRank,
    dependsOn: opts.dependsOn ?? [],
  },
  moduleDep: null,
  orgLesson: null,
  org: null,
});

describe('getCourseDetails — placement is the source of truth (site 1)', () => {
  // Mutant: drop the `rank: placement.rank` override in course.ts's
  // `lessonMap.set(...)` (i.e. let the spread `...lesson` keep the lesson
  // row's OWN `rank`). Correct-shaped — it still compiles, still assigns
  // some rank — but wrong-behaving: with lessons.rank and the placement's
  // rank deliberately disagreeing here, that mutant orders/labels the
  // lessons by the WRONG value. Verified RED against that mutant.
  it("orders and values lessons by the placement's rank, not lessons.rank", async () => {
    db.select
      .mockReturnValueOnce(makeChain([courseWithModuleRow]))
      .mockReturnValueOnce(
        makeChain([
          // lessons.rank says b, a — the placement says the opposite.
          lessonRow({
            id: 100,
            slug: 'a',
            lessonRank: '9',
            placementRank: '1',
          }),
          lessonRow({
            id: 101,
            slug: 'b',
            lessonRank: '2',
            placementRank: '5',
          }),
        ]),
      )
      .mockReturnValueOnce(makeChain([]));

    const details = await getCourseDetails('flight-basics');
    const lessons = details?.modules[0]?.lessons ?? [];

    expect(lessons.map((l) => l.slug)).toEqual(['a', 'b']);
    expect(lessons.map((l) => l.rank)).toEqual(['1', '5']);
  });

  // Mutant: replace `if (placement.dependsOn.length > 0) { ...push... }`
  // with a no-op, so `dependsOn` stays the seeded `[]` regardless of what
  // the placement carries — correct-shaped (still compiles, still a real
  // conditional), wrong-behaving (the prerequisite silently vanishes).
  // Verified RED against that mutant.
  it('carries dependsOn from the placement, not a lesson_dependencies row', async () => {
    db.select
      .mockReturnValueOnce(makeChain([courseWithModuleRow]))
      .mockReturnValueOnce(
        makeChain([
          lessonRow({
            id: 100,
            slug: 'a',
            lessonRank: '1',
            placementRank: '1',
            dependsOn: [{ lessonSlug: 'prereq' }],
          }),
        ]),
      )
      .mockReturnValueOnce(makeChain([]));

    const details = await getCourseDetails('flight-basics');
    const lesson = details?.modules[0]?.lessons[0];

    expect(lesson?.dependsOn).toEqual([{ lessonSlug: 'prereq' }]);
  });

  // Mutant: in the lessonData query's `.where()`, scope the `inArray(...)`
  // by `lessonsTable.moduleId` (the legacy column) instead of
  // `moduleLessonsTable.moduleId` — a "half migrated" query that still adds
  // the module_lessons JOIN (for rank/dependsOn) but leaves membership on
  // the old column. Correct-shaped (both are integer columns, it compiles
  // and runs), wrong-behaving: it is exactly the bug case 5 exists to catch
  // — a lesson with no PLACEMENT in this course but a stale `lessons
  // .module_id` pointing here would still appear, and a lesson placed here
  // via `module_lessons` whose legacy column points elsewhere would vanish.
  // Verified RED against that mutant (the rendered WHERE text differs).
  it('scopes lesson membership through module_lessons, not the legacy lessons.module_id column', async () => {
    const calls = newJoinCalls();
    db.select
      .mockReturnValueOnce(makeChain([courseWithModuleRow]))
      .mockReturnValueOnce(makeCapturingChain([], calls))
      .mockReturnValueOnce(makeChain([]));

    await getCourseDetails('flight-basics');

    expect(calls.innerJoin).toHaveLength(1);
    expect(calls.innerJoin[0][0]).toBe(moduleLessonsTable);
    expect(render(calls.innerJoin[0][1])).toBe(
      '"module_lessons"."lesson_id" = "lessons"."id"',
    );

    expect(calls.where).toHaveLength(1);
    expect(render(calls.where[0])).toBe('"module_lessons"."module_id" in $1');
  });
});

describe('an empty/all-WIP module still yields its row (sites 2-4 LEFT-join rule)', () => {
  // Mutant: change `.leftJoin(moduleLessonsTable, ...)` in getMyCourses
  // (src/db/course.ts) to `.innerJoin(...)`. Correct-shaped (compiles,
  // still a join), wrong-behaving: a subscribed course with a module that
  // has no placements at all would drop out of the /app grid instead of
  // reading 0%. Verified RED (moduleLessonsTable then shows up in
  // calls.innerJoin, not calls.leftJoin, and the position-based lessonsTable
  // check fails).
  it('getMyCourses left-joins module_lessons then lessons, never inner', async () => {
    const calls = newJoinCalls();
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getMyCourses('u1');

    const joinedTables = calls.leftJoin.map(([table]) => table);
    const moduleLessonsIndex = joinedTables.indexOf(moduleLessonsTable);
    expect(moduleLessonsIndex).toBeGreaterThanOrEqual(0);
    expect(render(calls.leftJoin[moduleLessonsIndex][1])).toBe(
      '"module_lessons"."module_id" = "modules"."id"',
    );

    const nextJoin = calls.leftJoin[moduleLessonsIndex + 1];
    expect(nextJoin?.[0]).toBe(lessonsTable);
    expect(render(nextJoin[1])).toBe(
      '("lessons"."id" = "module_lessons"."lesson_id" and "lessons"."is_available" = $1)',
    );

    expect(calls.innerJoin.some(([t]) => t === moduleLessonsTable)).toBe(false);
    expect(calls.innerJoin.some(([t]) => t === lessonsTable)).toBe(false);
  });

  // Mutant: change `.leftJoin(lessonsTable, ...)` in getCourseProgress
  // (src/db/course-progress.ts) to `.innerJoin(...)`. Correct-shaped,
  // wrong-behaving: a module whose lessons are all unavailable (or which has
  // no placements) would vanish from the sidebar's progress rows instead of
  // rendering its heading at 0%. Verified RED the same way as above.
  it('getCourseProgress left-joins module_lessons then lessons, never inner', async () => {
    const calls = newJoinCalls();
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getCourseProgress({ userId: 'u1', slug: 'flight-basics' });

    const joinedTables = calls.leftJoin.map(([table]) => table);
    const moduleLessonsIndex = joinedTables.indexOf(moduleLessonsTable);
    expect(moduleLessonsIndex).toBeGreaterThanOrEqual(0);
    expect(render(calls.leftJoin[moduleLessonsIndex][1])).toBe(
      '"module_lessons"."module_id" = "modules"."id"',
    );

    const nextJoin = calls.leftJoin[moduleLessonsIndex + 1];
    expect(nextJoin?.[0]).toBe(lessonsTable);
    expect(render(nextJoin[1])).toBe(
      '("lessons"."id" = "module_lessons"."lesson_id" and "lessons"."is_available" = $1)',
    );

    expect(calls.innerJoin.some(([t]) => t === lessonsTable)).toBe(false);
  });

  // Mutant: change `.leftJoin(moduleLessonsTable, ...)` in
  // getCourseContentForAgent (src/db/course-content.ts) to `.innerJoin(...)`.
  // Correct-shaped, wrong-behaving: a module with zero lessons (or zero
  // available ones) would drop out of the agent's corpus rows entirely
  // instead of surviving as a module-only row that keeps its heading.
  // Verified RED the same way.
  it('getCourseContentForAgent left-joins module_lessons then lessons, never inner', async () => {
    const calls = newJoinCalls();
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getCourseContentForAgent('flight-basics', { userId: 'u1' });

    const joinedTables = calls.leftJoin.map(([table]) => table);
    const moduleLessonsIndex = joinedTables.indexOf(moduleLessonsTable);
    expect(moduleLessonsIndex).toBeGreaterThanOrEqual(0);
    expect(render(calls.leftJoin[moduleLessonsIndex][1])).toBe(
      '"module_lessons"."module_id" = "modules"."id"',
    );

    const nextJoin = calls.leftJoin[moduleLessonsIndex + 1];
    expect(nextJoin?.[0]).toBe(lessonsTable);
    expect(render(nextJoin[1])).toBe(
      '"lessons"."id" = "module_lessons"."lesson_id"',
    );

    expect(calls.innerJoin.some(([t]) => t === moduleLessonsTable)).toBe(false);
    expect(calls.innerJoin.some(([t]) => t === lessonsTable)).toBe(false);
  });

  // Mutant: in getCourseContentForAgent's `.orderBy(...)`, keep
  // `asc(lessonsTable.rank)` instead of switching to
  // `asc(moduleLessonsTable.rank)`. Correct-shaped (still orders by SOME
  // rank column), wrong-behaving: a lesson's position in the RAG corpus
  // would follow its rank in whichever course it was originally authored
  // in, not this course's placement order. Verified RED (the second
  // rendered orderBy argument differs).
  it("getCourseContentForAgent orders lessons by the placement's rank, not lessons.rank", async () => {
    const calls = newJoinCalls();
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getCourseContentForAgent('flight-basics', { userId: 'u1' });

    expect(calls.orderBy).toHaveLength(1);
    const [moduleRankArg, lessonRankArg] = calls.orderBy[0] as SQL[];
    expect(render(moduleRankArg)).toBe('"modules"."rank" asc');
    expect(render(lessonRankArg)).toBe('"module_lessons"."rank" asc');
  });
});
