// @vitest-environment node
import {
  boolean,
  integer,
  jsonb,
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
  updateLessonName,
  updateModule,
} = await import('#/db/admin');

beforeEach(() => {
  vi.clearAllMocks();
  courseCache.invalidate.mockResolvedValue(undefined);
  lessonPlaybackCache.invalidate.mockResolvedValue(undefined);
  synthesiaThumbnailsCache.invalidate.mockResolvedValue(undefined);
  blob.del.mockResolvedValue(undefined);
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
    db.insert.mockReturnValueOnce(
      makeChain([
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
      ]),
    );
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await createLesson({ moduleId: 7, name: 'Stall Recovery' });

    expect(lessonAccess.getCourseSlugForModuleId).toHaveBeenCalledWith(7);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('setLessonVideo invalidates the owning course, resolved from lessonId', async () => {
    db.update.mockReturnValueOnce(
      makeChain([{ id: 9, slug: 'stall-recovery' }]),
    );
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);

    await setLessonVideo(9, 'mux', 'ref-123');

    expect(lessonAccess.getCourseSlugsForLessonId).toHaveBeenCalledWith(9);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
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

  it('moveLesson invalidates both the source and target course when they differ', async () => {
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['source-course']);
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

    // Resolved BEFORE the update — the join would 404 against the lesson's
    // new (post-move) moduleId otherwise.
    expect(lessonAccess.getCourseSlugsForLessonId).toHaveBeenCalledWith(9);
    expect(lessonAccess.getCourseSlugForModuleId).toHaveBeenCalledWith(20);
    expect(courseCache.invalidate).toHaveBeenCalledWith('source-course');
    expect(courseCache.invalidate).toHaveBeenCalledWith('target-course');
    expect(courseCache.invalidate).toHaveBeenCalledTimes(2);
  });

  it('moveLesson invalidates only once when source and target course are the same', async () => {
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

  it('updateLessonName invalidates the owning course, resolved from lessonId', async () => {
    db.update.mockReturnValueOnce(makeChain([{ id: 9, name: 'New name' }]));
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);

    await updateLessonName(9, 'New name');

    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  // This is the highest-stakes mutation: isAvailable/requiredSubscriptions
  // gate what students can see and unlock, so a stale cache here means an
  // admin publish or a subscription-tier change is invisible for up to 6h.
  it('updateLessonConfig invalidates the owning course when isAvailable flips', async () => {
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
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);

    await updateLessonConfig(9, { isAvailable: true });

    expect(lessonAccess.getCourseSlugsForLessonId).toHaveBeenCalledWith(9);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('deleteLesson invalidates the owning course, resolved before the row is gone', async () => {
    lessonAccess.getCourseSlugsForLessonId.mockResolvedValue(['flight-basics']);
    db.delete.mockReturnValueOnce(makeChain([{ id: 9, slug: 'stalls' }]));
    db.update.mockReturnValueOnce(makeChain([]));

    const result = await deleteLesson(9);

    expect(result).toBe(true);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
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
