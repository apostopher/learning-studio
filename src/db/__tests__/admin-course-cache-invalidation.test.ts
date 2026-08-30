// @vitest-environment node
import type { SQL } from 'drizzle-orm';
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

// Renders a captured drizzle condition/expression to exact parameterized SQL
// text — shared house pattern, see `render-sql.ts`'s doc comment. Needed here
// (Task 5d) to prove a query reads/writes through `module_lessons`/its own
// column rather than the legacy `lessons.module_id`/`lesson_dependencies` — a
// canned-row mock returns whatever it's told regardless of which table was
// actually queried, so only rendering the real condition tree can catch that
// class of mutant.
const render = renderSql;

// admin.ts pulls in real drizzle table objects, `#/lib/crypto.server` (which
// reads CREDENTIALS_ENCRYPTION_KEY off `#/env` at import time), and
// `#/lib/video-providers/resolve.server`. None of that machinery is exercised
// by the mutations under test here, but importing the real `#/db/schema`
// module is a known landmine under vitest (its `@/types` value import can't
// resolve — see memory: vitest can't resolve @/, use #/), so — following the
// repo's established "fully stub, never importOriginal" pattern (see
// src/db/__tests__/course-content-gating.test.ts) — the schema is rebuilt
// here with real `pgTable` columns (just enough for `eq`/`or`/`like`/`sql` to
// build real query fragments against) rather than plain object stubs.
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
// createCourse joins the new course to the active org, so that insert has to
// have a real table to build against too.
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
// Task 5a fix round 1: createLesson dual-writes into module_lessons (see its
// doc comment in admin.ts) alongside the legacy lessons row, and moveLesson
// dual-writes via movePlacement (mocked as a whole module below, not exercised
// through real column objects) — but the schema mock still needs a real
// pgTable here so `tx.insert(moduleLessonsTable)` in the real admin.ts code
// has a table object to pass through the mocked `db`/`tx`.
const moduleLessonsTable = pgTable('module_lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  lessonId: integer('lesson_id'),
  rank: numeric('rank'),
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
 * A chainable stub standing in for a single drizzle query. Every builder
 * method returns the same object so `.from().where().returning()` (or any
 * subset/order the real code uses) keeps chaining, and the object is itself
 * thenable so `await db.select(...).from(...).where(...)` — which never
 * calls `.returning()` — resolves too.
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

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  // createLesson dual-writes lessons + module_lessons in one
  // `db.transaction`. Default impl (set in beforeEach) just runs the
  // callback against `db` itself, so `tx.insert(...)` inside it routes
  // through the same `db.insert` mock every other test already asserts on.
  transaction: vi.fn(),
}));
const placements = vi.hoisted(() => ({
  getPlacementsForCourse: vi.fn(),
  movePlacement: vi.fn(),
}));
const lessonAccess = vi.hoisted(() => ({
  getCourseSlugsForLessonId: vi.fn(),
  getCourseSlugForModuleId: vi.fn(),
  getCourseSlugForCourseId: vi.fn(),
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
  modulesTable,
  moduleLessonsTable,
  lessonsTable,
  courseVideoProvidersTable,
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
}));
vi.mock('#/db/course', () => ({
  // admin.ts calls `getCourseDetailsWithCache.invalidate(slug)` — it never
  // calls the function itself, so the callable half is untested filler.
  getCourseDetailsWithCache: Object.assign(vi.fn(), courseCache),
}));
vi.mock('#/db/lesson-access', () => lessonAccess);
// moveLesson (Task 5a fix round 1) dual-writes via `movePlacement`, and createLesson dual-writes via a direct `module_lessons` insert (not through `linkLesson`) — `getPlacementsForCourse` is stubbed only because admin.ts's `getCourseBoard` imports it at module scope, unrelated to any test here.
vi.mock('#/db/placements', () => placements);
// Same reasoning as `#/db/course` above: admin.ts calls
// `getLessonPlayback.invalidate(slug)` only, never the reader itself. Without
// this mock, importing admin.ts would drag in the REAL lesson-playback.ts —
// which constructs a real `Redis.fromEnv()` client at module scope — into a
// test that never exercises it.
vi.mock('#/db/lesson-playback', () => ({
  getLessonPlayback: Object.assign(vi.fn(), lessonPlaybackCache),
}));
vi.mock('@vercel/blob', () => blob);
// admin.ts also imports #/lib/video-providers/resolve.server for the
// credential-save/playback-resolve paths. That module transitively pulls in
// #/integrations/synthesia/videos, which has a pre-existing `@/env` import
// unrelated to this change and unresolvable under vitest — stub it out
// rather than let it drag the whole chain in.
vi.mock('#/lib/video-providers/resolve.server', () => resolveServer);
// admin.ts calls `getVideoThumbnailsWithCache.invalidate(args)` from
// saveCourseProvider — it never calls the reader itself, so the callable
// half is untested filler. Without this mock, importing admin.ts would drag
// in the REAL thumbnails.ts (via posters.server.ts too), which constructs a
// real `Redis.fromEnv()` client — importing it is harmless, but calling the
// REAL `.invalidate()` in a test would issue a real Redis DEL.
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: Object.assign(vi.fn(), synthesiaThumbnailsCache),
}));

const {
  createCourse,
  createLesson,
  createModule,
  deleteCourse,
  deleteLesson,
  deleteModule,
  moveLesson,
  reorderModule,
  resolveLessonPlayback,
  saveCourseProvider,
  setLessonVideo,
  updateCourse,
  updateCourseOnboarding,
  updateLessonConfig,
  updateLessonDependencies,
  updateLessonName,
  updateModule,
} = await import('#/db/admin');
// Real crypto.server (see the note above `courseVideoProvidersTable`) —
// used here just to build a decryptable `secrets` fixture for
// resolveLessonPlayback's `resolveCourseProvider` call, not to test
// encryption itself.
const { encryptJson } = await import('#/lib/crypto.server');

beforeEach(() => {
  vi.clearAllMocks();
  courseCache.invalidate.mockResolvedValue(undefined);
  lessonPlaybackCache.invalidate.mockResolvedValue(undefined);
  synthesiaThumbnailsCache.invalidate.mockResolvedValue(undefined);
  blob.del.mockResolvedValue(undefined);
  // Default: the transaction callback just runs against `db` itself, so
  // `tx.insert(...)`/`tx.select(...)` inside createLesson route through the
  // same `db.insert`/`db.select` mocks every other test already queues.
  db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(db),
  );
});

describe('course-details cache invalidation', () => {
  // Guards against a narrower gap than the others: deleteCourse frees a slug
  // back to the pool, cacheWithRedis caches a `null` miss same as a hit (no
  // if(result) guard), so an admin read for the freed slug between the
  // delete and this create can plant a 6h-cached null that a same-named
  // recreate would otherwise sail past silently. Invalidating the freshly
  // assigned slug unconditionally closes that window without having to
  // reason about whether a stale entry actually exists.
  it('createCourse invalidates the newly assigned slug (closes the delete-then-recreate gap)', async () => {
    db.select.mockReturnValueOnce(makeChain([])); // taken slugs
    db.insert
      .mockReturnValueOnce(
        makeChain([
          {
            id: 5,
            name: 'Flight Basics',
            slug: 'flight-basics',
            description: null,
            imageUrlAvif: null,
            imageUrlWebp: null,
          },
        ]),
      )
      .mockReturnValueOnce(makeChain(undefined)); // course_orgs link

    await createCourse({ name: 'Flight Basics' }, 1);

    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  // Without this link the course has no `course_orgs` row, so the AI-training
  // modal's persona tab has nowhere to store a selection. Asserted on the
  // insert's arguments rather than on "it didn't throw": the point is that the
  // new course id actually reaches the join table, paired with the active org.
  it('createCourse joins the new course to the active org', async () => {
    db.select.mockReturnValueOnce(makeChain([])); // taken slugs
    const linkChain = makeChain(undefined);
    db.insert
      .mockReturnValueOnce(
        makeChain([
          {
            id: 5,
            name: 'Flight Basics',
            slug: 'flight-basics',
            description: null,
            imageUrlAvif: null,
            imageUrlWebp: null,
          },
        ]),
      )
      .mockReturnValueOnce(linkChain);

    await createCourse({ name: 'Flight Basics' }, 1);

    expect(db.insert).toHaveBeenNthCalledWith(2, courseOrgsTable);
    expect(linkChain.valuesArg).toEqual({ courseId: 5, orgId: 1 });
  });

  it('createModule invalidates the owning course, resolved from courseId', async () => {
    db.select
      .mockReturnValueOnce(makeChain([])) // taken slugs
      .mockReturnValueOnce(makeChain([{ maxRank: null }])); // maxRank
    db.insert.mockReturnValueOnce(
      makeChain([
        {
          id: 1,
          name: 'Intro',
          slug: 'intro',
          imageUrlAvif: null,
          imageUrlWebp: null,
          rank: '1',
          requiredSubscriptions: [],
        },
      ]),
    );
    lessonAccess.getCourseSlugForCourseId.mockResolvedValue('flight-basics');

    await createModule({ courseId: 42, name: 'Intro' });

    expect(lessonAccess.getCourseSlugForCourseId).toHaveBeenCalledWith(42);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('createLesson invalidates the owning course, resolved from moduleId', async () => {
    db.select
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([{ maxRank: null }]));
    const lessonInsert = makeChain([
      {
        id: 2,
        name: 'Stall Recovery',
        slug: 'stall-recovery',
        rank: '1',
        isAvailable: false,
        hasDebrief: false,
        needsVideoWatch: false,
        requiredSubscriptions: [],
        videoId: null,
        videoProvider: null,
        videoRef: null,
      },
    ]);
    const placementInsert = makeChain(undefined);
    // Task 5a fix round 2 (Important 2): the file's default `db.transaction`
    // mock (below, in `beforeEach`) hands the callback `db` itself, so a
    // mutant that deletes the transaction wrapper and issues two
    // independent `db.insert(...)` calls would satisfy every assertion
    // built on the module-level `db.insert` queue. This test instead
    // supplies a DISTINCT `tx` object with its own `insert` spy, so the
    // assertions below can tell "went through the transaction" apart from
    // "went through `db` directly and merely looks the same".
    const txInsert = vi
      .fn()
      .mockReturnValueOnce(lessonInsert)
      .mockReturnValueOnce(placementInsert);
    // Fix round 2, Critical 1: `createLesson` now resolves the new lesson's
    // `orgId` via a `tx.select(...)` (module -> course -> course_orgs)
    // BEFORE either insert — the fake `tx` needs a `.select` too, or the
    // real code crashes calling a method the old fake didn't have.
    const tx = {
      select: vi.fn().mockReturnValue(makeChain([{ orgId: 9 }])),
      insert: txInsert,
    };
    db.transaction.mockImplementationOnce(async (fn: (t: unknown) => unknown) =>
      fn(tx),
    );
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await createLesson({ moduleId: 7, name: 'Stall Recovery' });

    expect(lessonAccess.getCourseSlugForModuleId).toHaveBeenCalledWith(7);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
    // Task 5a fix round 1 regression (Critical 2): a lesson created without
    // a module_lessons row is invisible to every placement-based reader —
    // the learner lesson page, playback, and all five admin lesson routes
    // 404 on it. Asserted on what the dual-write insert actually received,
    // not merely that `db.insert` was called a second time.
    expect(txInsert).toHaveBeenNthCalledWith(1, lessonsTable);
    expect(txInsert).toHaveBeenNthCalledWith(2, moduleLessonsTable);
    expect(db.insert).not.toHaveBeenCalled();
    expect(placementInsert.valuesArg).toEqual({
      moduleId: 7,
      lessonId: 2,
      rank: '1',
      dependsOn: [],
    });
  });

  // Task 5d: `linkLesson`/`movePlacement` never touch `lessons.module_id`, so
  // the max rank among lessons whose LEGACY module_id names this module can
  // already disagree with what `module_lessons` actually holds — a fresh
  // lesson computed off the stale column could collide with an existing
  // placement's rank, or leave a gap. Mutant: revert the max-rank query back
  // to `.from(lessonsTable).where(eq(lessonsTable.moduleId, ...))` —
  // correct-shaped (still an integer FK, still compiles), wrong-behaving
  // (silently reads the wrong table the moment a placement and its lesson's
  // legacy module_id diverge). Verified RED: rendering that mutant's WHERE
  // produces `"lessons"."module_id" = $1`, not the module_lessons text below.
  it("createLesson's new-lesson rank is computed from placements in the target module, not legacy lessons.rank", async () => {
    const maxRankCalls: { from: unknown[]; where: SQL[] } = {
      from: [],
      where: [],
    };
    const maxRankChain = {
      from: (table: unknown) => {
        maxRankCalls.from.push(table);
        return maxRankChain;
      },
      where: (condition: SQL) => {
        maxRankCalls.where.push(condition);
        return maxRankChain;
      },
      // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve([{ maxRank: '3' }]).then(resolve, reject),
    };
    db.select
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(maxRankChain);
    const lessonInsert = makeChain([
      {
        id: 2,
        name: 'Stall Recovery',
        slug: 'stall-recovery',
        isAvailable: false,
        hasDebrief: false,
        needsVideoWatch: false,
        requiredSubscriptions: [],
        videoId: null,
        videoProvider: null,
        videoRef: null,
      },
    ]);
    const placementInsert = makeChain(undefined);
    const txInsert = vi
      .fn()
      .mockReturnValueOnce(lessonInsert)
      .mockReturnValueOnce(placementInsert);
    db.transaction.mockImplementationOnce(async (fn: (t: unknown) => unknown) =>
      fn({
        select: vi.fn().mockReturnValue(makeChain([{ orgId: 9 }])),
        insert: txInsert,
      }),
    );
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    const result = await createLesson({ moduleId: 7, name: 'Stall Recovery' });

    expect(maxRankCalls.from[0]).toBe(moduleLessonsTable);
    expect(render(maxRankCalls.where[0])).toBe(
      '"module_lessons"."module_id" = $1',
    );
    // Task 7: `lessons.rank` is gone — the `module_lessons` placement insert
    // is the ONLY write that carries the computed rank now. Mutant: read the
    // canned `lessonInsert` row's own rank (there isn't one any more, but a
    // stale reversion could reintroduce `rank: created.rank`) instead of the
    // locally-computed `rank` variable — asserting on the placement insert's
    // `.values()` argument (not on anything the lesson-row canned return
    // says) is what proves the value actually came from "3 + 1", not a
    // hardcoded fixture.
    expect(placementInsert.valuesArg).toMatchObject({ rank: '4' });
    // `admin.ts` returns the already-numeric `rank` local variable directly
    // now (no `Number(created.rank)` round-trip through a Postgres `numeric`
    // string) — a mutant that stringified it (`rank: String(rank)`) would
    // still satisfy the placement-insert assertion above (that's the WRITE
    // side) and only this catches it. Verified RED against that mutant
    // (`typeof result.rank` is `'string'`, not `'number'`).
    expect(typeof result.rank).toBe('number');
    expect(result.rank).toBe(4);
  });

  // Task 7, Addition 1: the transitional dual-write is gone — `createLesson`
  // must no longer write `moduleId`/`rank` onto the `lessons` row itself
  // (those columns don't exist post-migration), only onto its
  // `module_lessons` placement.
  it('createLesson writes only name/slug/requiredSubscriptions/orgId to lessonsTable — no moduleId or rank — and still places the lesson via module_lessons', async () => {
    db.select
      .mockReturnValueOnce(makeChain([])) // taken slugs
      .mockReturnValueOnce(makeChain([{ maxRank: null }])); // maxRank
    const lessonInsert = makeChain([
      {
        id: 2,
        name: 'Stall Recovery',
        slug: 'stall-recovery',
        isAvailable: false,
        hasDebrief: false,
        needsVideoWatch: false,
        requiredSubscriptions: [],
        videoId: null,
        videoProvider: null,
        videoRef: null,
      },
    ]);
    const placementInsert = makeChain(undefined);
    const txInsert = vi
      .fn()
      .mockReturnValueOnce(lessonInsert)
      .mockReturnValueOnce(placementInsert);
    db.transaction.mockImplementationOnce(async (fn: (t: unknown) => unknown) =>
      fn({
        select: vi.fn().mockReturnValue(makeChain([{ orgId: 9 }])),
        insert: txInsert,
      }),
    );
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await createLesson({ moduleId: 7, name: 'Stall Recovery' });

    // Mutant: restore the legacy dual-write (`moduleId: input.moduleId,
    // rank: String(rank)` back on the `lessonsTable` insert) — correct-
    // shaped (both were real columns before this task, so this still
    // compiles), wrong-behaving post-Task-7: an insert carrying them fails
    // on the real database with a "column does not exist" error this
    // canned-chain mock can't reproduce, so only asserting the exact
    // `.values()` argument catches it here.
    expect(txInsert).toHaveBeenNthCalledWith(1, lessonsTable);
    expect(lessonInsert.valuesArg).toEqual({
      name: 'Stall Recovery',
      slug: 'stall-recovery',
      requiredSubscriptions: [],
      orgId: 9,
    });
    // The placement insert is still the (only) placement write.
    expect(txInsert).toHaveBeenNthCalledWith(2, moduleLessonsTable);
    expect(placementInsert.valuesArg).toEqual({
      moduleId: 7,
      lessonId: 2,
      rank: '1',
      dependsOn: [],
    });
  });

  // Fix round 2, Critical 1: `lessons.org_id` is NOT NULL (Task 5/6), and
  // `createLesson`'s insert wrote nothing for it — every lesson-create
  // 500s the moment `migrate-lesson-placements.ts` (which sets that
  // constraint) has run. Resolved the same way that migration's own
  // backfill did: module -> course -> `course_orgs`, MIN(org_id) when a
  // course belongs to several. Mutant: read `orgId` from anywhere else (a
  // hardcoded default, `input`, `undefined`) instead of this query's
  // result — correct-shaped (still an integer, still compiles) but
  // wrong-behaving the instant a course belongs to an org other than
  // whatever was hardcoded. Verified RED: asserting the exact join/where
  // this query builds, and that the resolved value reaches the INSERT's
  // `.values()`, both fail against that mutant.
  it("createLesson resolves the new lesson's orgId via module → course → course_orgs (MIN org id)", async () => {
    const orgLookupCalls: {
      from: unknown[];
      innerJoin: [unknown, SQL][];
      where: SQL[];
    } = { from: [], innerJoin: [], where: [] };
    const orgLookupChain = {
      from: (table: unknown) => {
        orgLookupCalls.from.push(table);
        return orgLookupChain;
      },
      innerJoin: (table: unknown, condition: SQL) => {
        orgLookupCalls.innerJoin.push([table, condition]);
        return orgLookupChain;
      },
      where: (condition: SQL) => {
        orgLookupCalls.where.push(condition);
        return orgLookupChain;
      },
      // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve([{ orgId: 4 }]).then(resolve, reject),
    };
    db.select
      .mockReturnValueOnce(makeChain([])) // taken slugs
      .mockReturnValueOnce(makeChain([{ maxRank: null }])); // maxRank
    const lessonInsert = makeChain([
      {
        id: 2,
        name: 'Stall Recovery',
        slug: 'stall-recovery',
        isAvailable: false,
        hasDebrief: false,
        needsVideoWatch: false,
        requiredSubscriptions: [],
        videoId: null,
        videoProvider: null,
        videoRef: null,
      },
    ]);
    const placementInsert = makeChain(undefined);
    const txInsert = vi
      .fn()
      .mockReturnValueOnce(lessonInsert)
      .mockReturnValueOnce(placementInsert);
    const txSelect = vi.fn().mockReturnValue(orgLookupChain);
    db.transaction.mockImplementationOnce(async (fn: (t: unknown) => unknown) =>
      fn({ select: txSelect, insert: txInsert }),
    );
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await createLesson({ moduleId: 7, name: 'Stall Recovery' });

    expect(orgLookupCalls.from[0]).toBe(modulesTable);
    expect(orgLookupCalls.innerJoin[0][0]).toBe(courseOrgsTable);
    expect(render(orgLookupCalls.innerJoin[0][1])).toBe(
      '"course_orgs"."course_id" = "modules"."course_id"',
    );
    expect(render(orgLookupCalls.where[0])).toBe('"modules"."id" = $1');
    expect(renderSqlParams(orgLookupCalls.where[0])).toEqual([7]);
    // The value this query resolved is what actually reaches the INSERT —
    // not some other source.
    expect(lessonInsert.valuesArg).toMatchObject({ orgId: 4 });
  });

  // Fix round 2, Critical 1: a module whose course has no `course_orgs`
  // row would otherwise have to insert `orgId: null` — impossible now that
  // the column is NOT NULL, so it would 500 on the database anyway, but
  // silently and with no indication of WHY. Failing loudly first, before
  // any insert, names the module so whoever's debugging doesn't have to
  // reverse-engineer a bare constraint-violation error.
  it('createLesson fails loudly, before any insert, when the module’s course has no course_orgs row', async () => {
    db.select
      .mockReturnValueOnce(makeChain([])) // taken slugs
      .mockReturnValueOnce(makeChain([{ maxRank: null }])); // maxRank
    const txInsert = vi.fn();
    const txSelect = vi.fn().mockReturnValue(makeChain([])); // no course_orgs row
    db.transaction.mockImplementationOnce(async (fn: (t: unknown) => unknown) =>
      fn({ select: txSelect, insert: txInsert }),
    );

    await expect(
      createLesson({ moduleId: 7, name: 'Stall Recovery' }),
    ).rejects.toThrow(/module 7/i);
    expect(txInsert).not.toHaveBeenCalled();
    expect(courseCache.invalidate).not.toHaveBeenCalled();
  });

  it('setLessonVideo invalidates the cache for every course teaching the lesson', async () => {
    db.update.mockReturnValueOnce(
      makeChain([{ id: 9, slug: 'stall-recovery' }]),
    );
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue([
      'flight-basics',
      'aerobatics',
    ]);

    await setLessonVideo(9, 'mux', 'ref-123');

    expect(lessonAccess.getCourseSlugsForLessonId).toHaveBeenCalledWith(9);
    // Reverting to single-slug invalidation (the pre-Task-5a-fix-round-1
    // shape) would still pass a bare `toHaveBeenCalledWith('flight-basics')`
    // — asserting the full sorted set is what catches that regression.
    expect(
      courseCache.invalidate.mock.calls.map((call) => call[0]).sort(),
    ).toEqual(['aerobatics', 'flight-basics']);
  });

  // Regression guard for the bug the final review caught: a stale
  // lesson-playback cache entry served the PREVIOUS video's still-validly-
  // signed URL for up to its remaining TTL after an admin swap, because
  // nothing evicted it. Asserted on the SLUG the invalidation actually
  // received (not merely that `.invalidate` was called at all) — a call with
  // a hardcoded or wrong slug would leave the real stale entry untouched
  // while still passing a weaker assertion.
  it("setLessonVideo invalidates that lesson's own playback cache entry, by slug", async () => {
    db.update.mockReturnValueOnce(
      makeChain([{ id: 9, slug: 'stall-recovery' }]),
    );
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);

    await setLessonVideo(9, 'mux', 'ref-123');

    expect(lessonPlaybackCache.invalidate).toHaveBeenCalledWith(
      'stall-recovery',
    );
  });

  it('setLessonVideo skips invalidation when the lesson does not exist', async () => {
    db.update.mockReturnValueOnce(makeChain([]));

    const result = await setLessonVideo(999, 'mux', 'ref-123');

    expect(result).toBeNull();
    expect(lessonAccess.getCourseSlugsForLessonId).not.toHaveBeenCalled();
    expect(courseCache.invalidate).not.toHaveBeenCalled();
    expect(lessonPlaybackCache.invalidate).not.toHaveBeenCalled();
  });

  it('reorderModule invalidates the owning course, resolved from moduleId', async () => {
    db.update.mockReturnValueOnce(makeChain([{ id: 7, rank: '2' }]));
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await reorderModule({ moduleId: 7, prevModuleId: 1, nextModuleId: null });

    expect(lessonAccess.getCourseSlugForModuleId).toHaveBeenCalledWith(7);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('moveLesson invalidates every source course plus the target course when they differ', async () => {
    // Task 7: `moveLesson`'s only write is `movePlacement` now — a non-null
    // return is simply "the placement moved", nothing gates a second write
    // any more.
    placements.movePlacement.mockResolvedValueOnce({
      id: 1,
      moduleId: 20,
      lessonId: 9,
      rank: 1,
      dependsOn: [],
    });
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue([
      'source-course-a',
      'source-course-b',
    ]);
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('target-course');

    await moveLesson({
      lessonId: 9,
      targetModuleId: 20,
      prevLessonId: null,
      nextLessonId: null,
    });

    // Resolved BEFORE `movePlacement` runs — once that repoints the
    // placement at the target module/course, reading it after would already
    // see the new course instead of the old one(s).
    expect(lessonAccess.getCourseSlugsForLessonId).toHaveBeenCalledWith(9);
    expect(lessonAccess.getCourseSlugForModuleId).toHaveBeenCalledWith(20);
    // Reverting to a single-slug "source" (the pre-fix-round-1 shape) would
    // still pass a bare `toHaveBeenCalledWith` on either slug — asserting
    // the full sorted set is what catches that regression. No separate
    // `toHaveBeenCalledTimes` here: the array length already IS the call
    // count, and — unlike a bare count — it can't hold "by accident" if a
    // call target ever moved or duplicated. (This asserts only the
    // invalidation loop `moveLesson` itself runs. `#/db/placements` is fully
    // mocked in this file, so `movePlacement`'s OWN
    // `invalidateCourseDetailsCache('target-course')` call — real in
    // production — never fires here; production therefore invalidates
    // 'target-course' twice, once from each of the two functions, which is
    // redundant but harmless. See placement-writes.test.ts for movePlacement's
    // own invalidation coverage.)
    expect(
      courseCache.invalidate.mock.calls.map((call) => call[0]).sort(),
    ).toEqual(['source-course-a', 'source-course-b', 'target-course']);
  });

  it('moveLesson invalidates only once when source and target course are the same', async () => {
    placements.movePlacement.mockResolvedValueOnce({
      id: 1,
      moduleId: 20,
      lessonId: 9,
      rank: 1,
      dependsOn: [],
    });
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await moveLesson({
      lessonId: 9,
      targetModuleId: 20,
      prevLessonId: null,
      nextLessonId: null,
    });

    // Same caveat as the "differ" test above: this counts only
    // `moveLesson`'s OWN invalidation loop. `movePlacement` is fully mocked
    // in this file, so its real `invalidateCourseDetailsCache('flight-basics')`
    // call never fires here — production invalidates 'flight-basics' twice
    // (once from each function) even in the same-course case this test
    // covers, not once. The `1` below is testing `moveLesson`'s own Set
    // dedup (source and target collapse to one slug), not the total
    // invalidation count a real call would produce.
    expect(courseCache.invalidate).toHaveBeenCalledTimes(1);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('moveLesson touches neither db.update nor the cache when the placement move fails', async () => {
    placements.movePlacement.mockResolvedValueOnce(null);
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);

    const result = await moveLesson({
      lessonId: 9,
      targetModuleId: 20,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(result).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
    expect(courseCache.invalidate).not.toHaveBeenCalled();
  });

  // Task 7, Addition 1: the legacy `lessons.module_id`/`lessons.rank`
  // dual-write — and the `db.transaction` wrapper that existed solely to run
  // it atomically alongside the placement move — is gone. `movePlacement`
  // (called directly against the module-level `db`, no transaction) is now
  // the ONLY write `moveLesson` performs.
  it('moveLesson performs exactly one write path — the placement — and never touches lessonsTable', async () => {
    placements.movePlacement.mockResolvedValueOnce({
      id: 1,
      moduleId: 20,
      lessonId: 9,
      rank: 3,
      dependsOn: [],
    });
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    const result = await moveLesson({
      lessonId: 9,
      targetModuleId: 20,
      prevLessonId: null,
      nextLessonId: null,
    });

    // Mutant: restore the legacy `tx.update(lessonsTable)` write (wrapped
    // back in `db.transaction`) alongside the placement move — correct-
    // shaped (both are real writes against real tables, and this is
    // word-for-word what the code looked like before Task 7) but wrong-
    // behaving post-Task-7: that UPDATE's SET clause would reference
    // `moduleId`/`rank` columns that no longer exist and fail on the real
    // database, which this canned-chain mock can't reproduce — only
    // asserting `lessonsTable` is never the target of an update, and that no
    // transaction wrapper is used at all, catches it here.
    expect(db.update).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    // No second (transaction) argument any more — `movePlacement` runs
    // against the module-level `db` directly.
    expect(placements.movePlacement).toHaveBeenCalledWith({
      lessonId: 9,
      targetModuleId: 20,
      prevLessonId: null,
      nextLessonId: null,
    });
    // `id`/`rank`/`moduleId` in the result all now come straight from the
    // placement (and the caller's own input for `id`) — never from a
    // `lessonsTable` row.
    expect(result).toEqual({ id: 9, rank: 3, moduleId: 20 });
  });

  it('updateLessonName invalidates the owning course, resolved from lessonId', async () => {
    db.update.mockReturnValueOnce(makeChain([{ id: 9, name: 'New name' }]));
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);

    await updateLessonName(9, 'New name');

    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  // This is the highest-stakes mutation: isAvailable/requiredSubscriptions
  // gate what students can see and unlock, so a stale cache here means an
  // admin publish or a subscription-tier change is invisible for up to 6h.
  it('updateLessonConfig invalidates every course teaching the lesson when isAvailable flips', async () => {
    db.update.mockReturnValueOnce(
      makeChain([
        {
          id: 9,
          isAvailable: true,
          hasDebrief: false,
          needsVideoWatch: false,
          requiredSubscriptions: [],
        },
      ]),
    );
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue([
      'flight-basics',
      'aerobatics',
      'instrument-rating',
    ]);

    await updateLessonConfig(9, { isAvailable: true });

    expect(lessonAccess.getCourseSlugsForLessonId).toHaveBeenCalledWith(9);
    // Reverting to single-slug invalidation would still pass a bare
    // `toHaveBeenCalledWith` on one of these — asserting the full sorted set
    // is what catches that regression.
    expect(
      courseCache.invalidate.mock.calls.map((call) => call[0]).sort(),
    ).toEqual(['aerobatics', 'flight-basics', 'instrument-rating']);
  });

  it('deleteLesson invalidates every course teaching the lesson, resolved before the row is gone', async () => {
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue([
      'flight-basics',
      'aerobatics',
    ]);
    db.delete.mockReturnValueOnce(makeChain([{ id: 9, slug: 'stalls' }]));
    db.update.mockReturnValueOnce(makeChain([]));

    const result = await deleteLesson(9);

    expect(result).toBe(true);
    // Reverting to single-slug invalidation would still pass a bare
    // `toHaveBeenCalledWith` on one of these — asserting the full sorted set
    // is what catches that regression.
    expect(
      courseCache.invalidate.mock.calls.map((call) => call[0]).sort(),
    ).toEqual(['aerobatics', 'flight-basics']);
  });

  // Task 5d: prerequisites now live on the PLACEMENT (`module_lessons
  // .depends_on`), not the legacy per-lesson `lesson_dependencies` row — the
  // board reads placement dependsOn, so stripping the old table left this a
  // silent no-op (the dead slug's chip never actually disappeared). Mutant:
  // revert `db.update(moduleLessonsTable)` back to `db.update
  // (lessonDependenciesTable)` — that table isn't even imported by admin.ts
  // any more, so this mutant needs the old import restored too; still
  // correct-shaped SQL, wrong-behaving (writes a table nothing reads).
  // Verified RED against that mutant.
  // Important 3 (fix round 1): `toHaveBeenCalledWith(moduleLessonsTable)`
  // alone proves the TABLE, not the SCOPE — a mutant that adds
  // `and(eq(moduleLessonsTable.lessonId, lessonId), ...)` (exactly the
  // regression this requirement names: silently confining the strip to the
  // deleted lesson's OWN placements instead of every placement) still
  // targets `moduleLessonsTable` and passes that assertion untouched.
  // Capturing the actual `.where()` condition and rendering it to exact SQL
  // pins that the WHERE is nothing but the jsonb-containment check — no
  // lessonId, no courseId, no join at all.
  it("deleteLesson strips the dead slug from every dependent PLACEMENT's dependsOn, across every course", async () => {
    // Asserts the UPDATE was issued against module_lessons, not that a row
    // changed: without it, dependents keep an edge to a lesson that no
    // longer exists and the admin UI renders a chip for a prerequisite that
    // is not there. deleteModule has done this since it shipped; lessons
    // never did. No course/lesson scoping is added to the WHERE (only a
    // jsonb-containment check on the dead slug) — deliberately broader than
    // strictly needed today (see admin.ts's doc comment on this strip): it's
    // defence in depth against `unlinkLesson` (zero callers currently)
    // leaving a dangling cross-course reference once it gets one.
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);
    db.delete.mockReturnValueOnce(makeChain([{ id: 9, slug: 'stalls' }]));
    const whereCalls: SQL[] = [];
    const updateChain = {
      set: () => updateChain,
      where: (condition: SQL) => {
        whereCalls.push(condition);
        return updateChain;
      },
      // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve([]).then(resolve, reject),
    };
    db.update.mockReturnValueOnce(updateChain);

    await deleteLesson(9);

    expect(db.update).toHaveBeenCalledWith(moduleLessonsTable);
    expect(render(whereCalls[0])).toBe(
      '"module_lessons"."depends_on" @> $1::jsonb',
    );
  });

  it('deleteLesson skips invalidation when nothing was deleted', async () => {
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);
    db.delete.mockReturnValueOnce(makeChain([]));

    const result = await deleteLesson(999);

    expect(result).toBe(false);
    expect(courseCache.invalidate).not.toHaveBeenCalled();
  });

  // Task 5d: this was a SILENT NO-OP bug, not a refactor — the function
  // wrote `lesson_dependencies` while the board (and everything else) reads
  // `module_lessons.depends_on`. An admin saving prerequisites got a 200 and
  // a cache invalidation, and the chips never changed. Mutant: revert the
  // write back to `db.insert(lessonDependenciesTable)`/`db.delete
  // (lessonDependenciesTable)` — that table isn't imported by admin.ts any
  // more, so restoring the mutant needs the import back too; the write
  // still "succeeds" (200, `{ ok: true, ... }`), just against a table
  // nothing downstream reads. Verified RED against that mutant (`db.update`
  // is never called with `moduleLessonsTable`, and `db.insert`/`db.delete`
  // fire instead).
  it('updateLessonDependencies writes module_lessons.dependsOn for the placement in the given course, never lesson_dependencies', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ placementId: 55 }])) // this lesson's placement in courseId 3
      .mockReturnValueOnce(makeChain([{ slug: 'intro' }])); // sibling lesson slugs in that course
    const setCalls: unknown[] = [];
    const whereCalls: SQL[] = [];
    const updateChain = {
      set: (v: unknown) => {
        setCalls.push(v);
        return updateChain;
      },
      where: (condition: SQL) => {
        whereCalls.push(condition);
        return updateChain;
      },
      // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(undefined).then(resolve, reject),
    };
    db.update.mockReturnValueOnce(updateChain);
    lessonAccess.getCourseSlugForCourseId.mockResolvedValue('flight-basics');

    const result = await updateLessonDependencies(9, 3, ['intro']);

    expect(result).toEqual({
      ok: true,
      dependsOn: [{ lessonSlug: 'intro' }],
    });
    expect(db.update).toHaveBeenCalledWith(moduleLessonsTable);
    expect(setCalls[0]).toMatchObject({
      dependsOn: [{ lessonSlug: 'intro' }],
    });
    expect(render(whereCalls[0])).toBe('"module_lessons"."id" = $1');
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  // Important 2 (fix round 1): the (lessonId, courseId) placement lookup and
  // the sibling-slug lookup are what make this a per-COURSE write at all — a
  // canned-row mock like `makeChain` discards `.where()` entirely, so
  // dropping `eq(modulesTable.courseId, courseId)` from either query's
  // condition (silently reverting to "whichever placement/sibling set comes
  // back first") would satisfy every OTHER assertion in this describe block
  // unchanged. Captures both queries' `.where()` conditions and renders them
  // to exact SQL text instead of trusting the canned rows.
  it('scopes both the placement lookup and the sibling-slug validation to the given courseId', async () => {
    const placementWhereCalls: SQL[] = [];
    const siblingWhereCalls: SQL[] = [];
    const placementChain = {
      from: () => placementChain,
      innerJoin: () => placementChain,
      where: (condition: SQL) => {
        placementWhereCalls.push(condition);
        return placementChain;
      },
      // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve([{ placementId: 55 }]).then(resolve, reject),
    };
    const siblingChain = {
      from: () => siblingChain,
      innerJoin: () => siblingChain,
      where: (condition: SQL) => {
        siblingWhereCalls.push(condition);
        return siblingChain;
      },
      // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve([{ slug: 'intro' }]).then(resolve, reject),
    };
    db.select
      .mockReturnValueOnce(placementChain)
      .mockReturnValueOnce(siblingChain);
    db.update.mockReturnValueOnce(makeChain(undefined));
    lessonAccess.getCourseSlugForCourseId.mockResolvedValue('flight-basics');

    await updateLessonDependencies(9, 3, ['intro']);

    expect(render(placementWhereCalls[0])).toBe(
      '("module_lessons"."lesson_id" = $1 and "modules"."course_id" = $2)',
    );
    expect(render(siblingWhereCalls[0])).toBe('"modules"."course_id" = $1');
  });

  // Prerequisites are now per-PLACEMENT: this write only ever targets the one
  // course it was asked to edit (`courseId`, sent by the client — see
  // admin.ts's doc comment on this function). Mutant: revert to
  // `invalidateAllCoursesForLesson(lessonId)` —
  // correct-shaped (still invalidates something real), wrong-behaving: it
  // would bust the cache for every OTHER course teaching this lesson even
  // though their own placement's dependsOn was never touched. Verified RED
  // (that mutant calls `getCourseSlugsForLessonId`, which this test never
  // stubs to resolve — the assertions below want `getCourseSlugForCourseId`
  // instead).
  it('updateLessonDependencies invalidates only the course it was asked to edit', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ placementId: 55 }]))
      .mockReturnValueOnce(makeChain([]));
    db.update.mockReturnValueOnce(makeChain(undefined));
    lessonAccess.getCourseSlugForCourseId.mockResolvedValue('flight-basics');
    // Stubbed even though correct code never calls it: without this, the
    // regression mutant this test guards against (falling back to
    // `invalidateAllCoursesForLesson`) crashes on an unmocked resolved
    // value instead of failing the assertions below on its own terms.
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['aerobatics']);

    await updateLessonDependencies(9, 3, []);

    expect(lessonAccess.getCourseSlugForCourseId).toHaveBeenCalledWith(3);
    expect(courseCache.invalidate).toHaveBeenCalledTimes(1);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
    expect(lessonAccess.getCourseSlugsForLessonId).not.toHaveBeenCalled();
  });

  it('updateLessonDependencies reports not-found when the lesson has no placement in that course', async () => {
    db.select.mockReturnValueOnce(makeChain([])); // no matching placement

    const result = await updateLessonDependencies(9, 3, []);

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(db.update).not.toHaveBeenCalled();
    expect(courseCache.invalidate).not.toHaveBeenCalled();
  });

  it('updateModule invalidates the owning course, resolved from moduleId', async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ imageUrlAvif: null, imageUrlWebp: null }]),
    );
    db.update.mockReturnValueOnce(makeChain([{ id: 7, name: 'Module 2' }]));
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await updateModule(7, { name: 'Module 2' });

    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('deleteModule invalidates the owning course, resolved before the row is gone', async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ imageUrlAvif: null, imageUrlWebp: null }]),
    );
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');
    db.delete.mockReturnValueOnce(makeChain([{ id: 7 }]));

    const result = await deleteModule(7);

    expect(result).toBe(true);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('updateCourse invalidates using the slug from its own returning() row', async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ imageUrlAvif: null, imageUrlWebp: null }]),
    );
    db.update.mockReturnValueOnce(
      makeChain([
        {
          id: 42,
          slug: 'flight-basics',
          name: 'Flight Basics',
          description: null,
          imageUrlAvif: null,
          imageUrlWebp: null,
        },
      ]),
    );

    await updateCourse(42, { name: 'Flight Basics' });

    // No lesson-access lookup needed — slug is immutable and already on the
    // updated row.
    expect(lessonAccess.getCourseSlugForCourseId).not.toHaveBeenCalled();
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('updateCourseOnboarding invalidates the owning course, resolved from courseId', async () => {
    db.update.mockReturnValueOnce(makeChain(undefined));
    lessonAccess.getCourseSlugForCourseId.mockResolvedValue('flight-basics');

    await updateCourseOnboarding(42, []);

    expect(lessonAccess.getCourseSlugForCourseId).toHaveBeenCalledWith(42);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('deleteCourse invalidates using the slug captured before the delete', async () => {
    db.select
      .mockReturnValueOnce(
        makeChain([
          { slug: 'flight-basics', imageUrlAvif: null, imageUrlWebp: null },
        ]),
      )
      .mockReturnValueOnce(makeChain([])); // module cover images
    db.delete.mockReturnValueOnce(makeChain([{ id: 42 }]));

    const result = await deleteCourse(42);

    expect(result).toBe(true);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('deleteCourse skips invalidation when nothing was deleted', async () => {
    db.select
      .mockReturnValueOnce(
        makeChain([
          { slug: 'flight-basics', imageUrlAvif: null, imageUrlWebp: null },
        ]),
      )
      .mockReturnValueOnce(makeChain([]));
    db.delete.mockReturnValueOnce(makeChain([]));

    const result = await deleteCourse(999);

    expect(result).toBe(false);
    expect(courseCache.invalidate).not.toHaveBeenCalled();
  });

  it('a Redis failure during invalidation is swallowed, not thrown, and is logged', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    db.update.mockReturnValueOnce(makeChain([{ id: 9 }]));
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);
    courseCache.invalidate.mockRejectedValueOnce(new Error('redis down'));

    await expect(setLessonVideo(9, 'mux', 'ref-123')).resolves.toEqual({
      id: 9,
    });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

describe('resolveLessonPlayback course scoping', () => {
  // Task 5e, Part 2e: the caller's own `courseId` is a WHERE predicate
  // (`eq(modulesTable.courseId, courseId)`), added alongside `eq(lessonsTable
  // .id, lessonId)` in fix round 1 so the permission guard and the credential
  // lookup can never disagree about which course they're both looking at
  // (see this function's own doc comment on why). Before this test, nothing
  // rendered that predicate to SQL — a mutant that dropped it (leaving only
  // the lessonId check) would still resolve videoProvider/videoRef from
  // WHICHEVER course a join happened to return first, silently reintroducing
  // the exact bug fix round 1 closed, undetected by anything in this file.
  //
  // Fix round 1 (Important 1): rendered SQL text alone shows column names,
  // not bound values — `and(eq(lessonsTable.id, courseId), eq(modulesTable
  // .courseId, lessonId))` (the two integer arguments swapped) renders to
  // the exact same string, since both are still `$1`/`$2` placeholders in
  // the same two slots. That swap is exactly the "two integers threaded
  // through a two-arg function" defect this function's own doc comment
  // warns about. `renderSqlParams` closes it.
  it('scopes the lesson lookup by BOTH lessonId and the caller-supplied courseId', async () => {
    const whereCalls: SQL[] = [];
    const lessonLookupChain = {
      from: () => lessonLookupChain,
      innerJoin: () => lessonLookupChain,
      where: (condition: SQL) => {
        whereCalls.push(condition);
        return lessonLookupChain;
      },
      orderBy: () => lessonLookupChain,
      limit: () =>
        Promise.resolve([{ videoProvider: 'mux', videoRef: 'ref-123' }]),
    };
    db.select
      .mockReturnValueOnce(lessonLookupChain)
      .mockReturnValueOnce(
        makeChain([{ secrets: encryptJson({ keyId: 'k', privateKey: 'p' }) }]),
      );
    resolveServer.resolvePlayback.mockResolvedValue({
      status: 'ready',
      url: 'https://x/y.m3u8',
      kind: 'hls',
      expiresInSeconds: 3600,
      poster: null,
      captions: null,
    });

    await resolveLessonPlayback(9, 3);

    expect(whereCalls).toHaveLength(1);
    expect(render(whereCalls[0])).toBe(
      '("lessons"."id" = $1 and "modules"."course_id" = $2)',
    );
    expect(renderSqlParams(whereCalls[0])).toEqual([9, 3]);
  });

  // Task 5e, Part 3a (production regression): the unique index on
  // module_lessons only covers (module_id, lesson_id), per MODULE — nothing
  // in the DB stops the same lesson from having two placements inside this
  // one course, in two different modules. Before this fix, `resolveLesson
  // Playback` destructured `[lesson]` from an UNBOUNDED, unordered result.
  // Fix round 1 (Minor): both selected columns (`videoProvider`/`videoRef`)
  // come from `lessonsTable`, and the WHERE already pins `lessons.id` to one
  // exact lesson, so every duplicate row carries IDENTICAL provider/ref — the
  // old code was already value-deterministic and never "flapped" playback.
  // The actual bug was pure join fan-out: two matching rows instead of one,
  // an unbounded result shape the code's own `const [lesson] = ...`
  // destructuring assumed away. `.limit(1)` is a correctness-of-shape and
  // cost fix (exactly one row fetched, matching what the code always assumed
  // it was getting), not a value-flapping fix. Fixed by adding
  // `.orderBy(moduleLessonsTable.moduleId).limit(1)`, matching the
  // "deterministic tie-break" shape `lesson-access.ts` uses for the same
  // class of ambiguity (there, across courses; here, across modules within
  // one fixed course — `module_lessons.module_id` is a stable non-null
  // integer and the right remaining ambiguity axis once `courseId` is
  // fixed). Verified RED against dropping both calls: with no
  // `.orderBy()`/`.limit()` in the chain, `await db.select()...where(...)`
  // resolves to the (non-array) chain object itself, and destructuring
  // `[lesson]` off it throws instead of returning a lesson.
  it('orders by module id and takes exactly one row, so two placements of one lesson within a course resolve deterministically', async () => {
    const orderByCalls: unknown[] = [];
    const limitCalls: unknown[] = [];
    const lessonLookupChain = {
      from: () => lessonLookupChain,
      innerJoin: () => lessonLookupChain,
      where: () => lessonLookupChain,
      orderBy: (col: unknown) => {
        orderByCalls.push(col);
        return lessonLookupChain;
      },
      limit: (n: unknown) => {
        limitCalls.push(n);
        return Promise.resolve([{ videoProvider: 'mux', videoRef: 'ref-123' }]);
      },
    };
    db.select
      .mockReturnValueOnce(lessonLookupChain)
      .mockReturnValueOnce(
        makeChain([{ secrets: encryptJson({ keyId: 'k', privateKey: 'p' }) }]),
      );
    resolveServer.resolvePlayback.mockResolvedValue({
      status: 'ready',
      url: 'https://x/y.m3u8',
      kind: 'hls',
      expiresInSeconds: 3600,
      poster: null,
      captions: null,
    });

    const result = await resolveLessonPlayback(9, 3);

    expect(orderByCalls).toHaveLength(1);
    // Fix round 1 (Important 2): asserting by `.name` ('module_id') rather
    // than by object identity let a mutant ordering by the LEGACY column —
    // `.orderBy(lessonsTable.moduleId)` — pass undetected: `lessonsTable` is
    // already in scope as the FROM table, it still has a `module_id` column,
    // and that column's `.name` is also `'module_id'`. Reverting to the
    // legacy column for the tie-break is exactly the defect class this whole
    // migration guards against, so identity is the only check that actually
    // proves which TABLE's column was used.
    expect(orderByCalls[0]).toBe(moduleLessonsTable.moduleId);
    expect(limitCalls).toEqual([1]);
    expect(result?.status).toBe('ready');
  });
});

describe('saveCourseProvider Synthesia thumbnail cache invalidation', () => {
  // A rotated/corrected Synthesia key used to leave the Redis-cached
  // thumbnail sweep untouched, so posters could stay wrong or missing for up
  // to `MAX_TTL_SECONDS` (6h — see computeThumbnailCacheTTL's fallback for
  // URLs with no `Expires`) with no admin recourse. Asserted on the actual
  // args `.invalidate` received, not merely that it was called: a call with a
  // dummy/wrong apiKey would leave the real cache entry untouched if the
  // cache's keyGenerator ever starts keying on it.
  it('invalidates the Synthesia thumbnail cache with the real API key being saved', async () => {
    resolveServer.validateCredentials.mockResolvedValue({ ok: true });
    db.insert.mockReturnValueOnce(makeChain(undefined));

    await saveCourseProvider(42, {
      provider: 'synthesia',
      apiKey: 'sk-corrected-key',
    });

    expect(synthesiaThumbnailsCache.invalidate).toHaveBeenCalledWith({
      courseId: 42,
      apiKey: 'sk-corrected-key',
    });
  });

  it('does not touch the Synthesia thumbnail cache when saving a Mux credential', async () => {
    resolveServer.validateCredentials.mockResolvedValue({ ok: true });
    db.insert.mockReturnValueOnce(makeChain(undefined));

    await saveCourseProvider(42, {
      provider: 'mux',
      keyId: 'key-id',
      privateKey: 'private-key',
    });

    expect(synthesiaThumbnailsCache.invalidate).not.toHaveBeenCalled();
  });

  it('does not invalidate when credential validation fails', async () => {
    resolveServer.validateCredentials.mockResolvedValue({
      ok: false,
      error: 'bad key',
    });

    const result = await saveCourseProvider(42, {
      provider: 'synthesia',
      apiKey: 'bad-key',
    });

    expect(result.ok).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
    expect(synthesiaThumbnailsCache.invalidate).not.toHaveBeenCalled();
  });

  it('a Redis failure during Synthesia cache invalidation is swallowed, not thrown, and is logged', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    resolveServer.validateCredentials.mockResolvedValue({ ok: true });
    db.insert.mockReturnValueOnce(makeChain(undefined));
    synthesiaThumbnailsCache.invalidate.mockRejectedValueOnce(
      new Error('redis down'),
    );

    await expect(
      saveCourseProvider(42, {
        provider: 'synthesia',
        apiKey: 'sk-corrected-key',
      }),
    ).resolves.toEqual({ ok: true });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
