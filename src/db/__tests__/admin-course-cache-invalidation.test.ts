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
// deleteLesson strips the dead slug from every dependent's depends_on, so
// this needs to be a real pgTable for the jsonb update to build.
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
  lessonDependenciesTable,
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
  saveCourseProvider,
  setLessonVideo,
  updateCourse,
  updateCourseOnboarding,
  updateLessonConfig,
  updateLessonDependencies,
  updateLessonName,
  updateModule,
} = await import('#/db/admin');

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
    db.insert
      .mockReturnValueOnce(lessonInsert)
      .mockReturnValueOnce(placementInsert);
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await createLesson({ moduleId: 7, name: 'Stall Recovery' });

    expect(lessonAccess.getCourseSlugForModuleId).toHaveBeenCalledWith(7);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
    // Task 5a fix round 1 regression (Critical 2): a lesson created without
    // a module_lessons row is invisible to every placement-based reader —
    // the learner lesson page, playback, and all five admin lesson routes
    // 404 on it. Asserted on what the dual-write insert actually received,
    // not merely that `db.insert` was called a second time.
    expect(db.insert).toHaveBeenNthCalledWith(2, moduleLessonsTable);
    expect(placementInsert.valuesArg).toEqual({
      moduleId: 7,
      lessonId: 2,
      rank: '1',
      dependsOn: [],
    });
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
    // Task 5a fix round 1: moveLesson now dual-writes the placement via
    // `movePlacement` BEFORE touching the legacy `lessons` row — a
    // non-null return is the "placement move succeeded" signal the legacy
    // update is gated on.
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
    db.update.mockReturnValueOnce(
      makeChain([{ id: 9, rank: '1', moduleId: 20 }]),
    );
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
    // the full sorted set is what catches that regression.
    expect(
      courseCache.invalidate.mock.calls.map((call) => call[0]).sort(),
    ).toEqual(['source-course-a', 'source-course-b', 'target-course']);
    expect(courseCache.invalidate).toHaveBeenCalledTimes(3);
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
    db.update.mockReturnValueOnce(
      makeChain([{ id: 9, rank: '1', moduleId: 20 }]),
    );
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await moveLesson({
      lessonId: 9,
      targetModuleId: 20,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(courseCache.invalidate).toHaveBeenCalledTimes(1);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  // Task 5a fix round 1 regression (Critical 1 closure): dual-write must be
  // all-or-nothing. If the placement move fails, the legacy `lessons.module_id`
  // must NOT move either — that divergence (placement says one course,
  // `lessons.module_id` says another) is exactly what made a cross-course
  // move 500 the learner lesson page.
  it('moveLesson touches neither the legacy row nor the cache when the placement move fails', async () => {
    placements.movePlacement.mockResolvedValueOnce(null);
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);
    // Deliberately NOT queuing a `db.update` return value: correct code
    // never reaches it (the assertion below is what proves that), and a
    // `mockReturnValueOnce` queued here but left unconsumed by correct code
    // would leak into a LATER test's `db.update` call and corrupt it — `vi
    // .clearAllMocks()` clears call history but not queued once-values. A
    // regression that proceeds anyway will throw when it hits the real,
    // un-queued `db.update(...)` call — still a legitimate red, tied
    // directly to the mutant's behavior rather than an unrelated crash.

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

  // Task 5a fix round 1 regression (atomicity gap): the placement move and
  // the legacy `lessons` update must run in the SAME database transaction,
  // not two independent writes — otherwise the legacy column can commit
  // while the placement write fails (or vice versa), which is the exact
  // divergence this dual-write exists to prevent (see Critical 1). A plain
  // "both succeeded" assertion can't tell the two writes were transactional
  // together apart from them merely both succeeding independently, so this
  // asserts `movePlacement` received the SAME `tx` object the legacy update
  // ran against.
  it('moveLesson runs the placement move and the legacy update in one transaction', async () => {
    const txUpdate = vi
      .fn()
      .mockReturnValue(makeChain([{ id: 9, rank: '1', moduleId: 20 }]));
    const tx = { update: txUpdate };
    db.transaction.mockImplementationOnce(async (fn: (t: unknown) => unknown) =>
      fn(tx),
    );
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

    expect(placements.movePlacement).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: 9, targetModuleId: 20 }),
      tx,
    );
    expect(txUpdate).toHaveBeenCalledWith(lessonsTable);
    // The module-level `db.update` must NOT be used for the legacy write —
    // that would be a second, independent write outside the transaction.
    expect(db.update).not.toHaveBeenCalled();
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

  it('deleteLesson strips the dead slug from every dependent', async () => {
    // Asserts the UPDATE was issued, not that a row changed: without it,
    // dependents keep an edge to a lesson that no longer exists and the admin
    // UI renders a chip for a prerequisite that is not there. deleteModule has
    // done this since it shipped; lessons never did.
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);
    db.delete.mockReturnValueOnce(makeChain([{ id: 9, slug: 'stalls' }]));
    db.update.mockReturnValueOnce(makeChain([]));

    await deleteLesson(9);

    expect(db.update).toHaveBeenCalledWith(lessonDependenciesTable);
  });

  it('deleteLesson skips invalidation when nothing was deleted', async () => {
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);
    db.delete.mockReturnValueOnce(makeChain([]));

    const result = await deleteLesson(999);

    expect(result).toBe(false);
    expect(courseCache.invalidate).not.toHaveBeenCalled();
  });

  it('updateLessonDependencies invalidates every course teaching the lesson', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ courseId: 3 }])) // owning course lookup
      .mockReturnValueOnce(makeChain([])); // sibling lesson slugs in that course
    db.delete.mockReturnValueOnce(makeChain(undefined));
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue([
      'flight-basics',
      'aerobatics',
    ]);

    const result = await updateLessonDependencies(9, []);

    expect(result).toEqual({ ok: true, dependsOn: [] });
    expect(lessonAccess.getCourseSlugsForLessonId).toHaveBeenCalledWith(9);
    // Reverting to single-slug invalidation would still pass a bare
    // `toHaveBeenCalledWith` on one of these — asserting the full sorted set
    // is what catches that regression.
    expect(
      courseCache.invalidate.mock.calls.map((call) => call[0]).sort(),
    ).toEqual(['aerobatics', 'flight-basics']);
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
