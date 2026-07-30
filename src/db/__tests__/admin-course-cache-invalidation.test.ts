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
    values: () => chain,
    set: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    limit: () => chain,
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
  getCourseSlugForLessonId: vi.fn(),
  getCourseSlugForModuleId: vi.fn(),
  getCourseSlugForCourseId: vi.fn(),
}));
const courseCache = vi.hoisted(() => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
const blob = vi.hoisted(() => ({
  del: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue({ blobs: [], hasMore: false }),
}));

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({
  coursesTable,
  modulesTable,
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
vi.mock('@vercel/blob', () => blob);
// admin.ts also imports #/lib/video-providers/resolve.server for the
// (untouched-by-this-task) credential-save/playback-resolve paths. That
// module transitively pulls in #/integrations/synthesia/videos, which has a
// pre-existing `@/env` import unrelated to this change and unresolvable
// under vitest — stub it out rather than let it drag the whole chain in.
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: vi.fn(),
  validateCredentials: vi.fn(),
}));

const {
  createLesson,
  createModule,
  deleteCourse,
  deleteLesson,
  deleteModule,
  moveLesson,
  reorderModule,
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
  blob.del.mockResolvedValue(undefined);
});

describe('course-details cache invalidation', () => {
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
    db.update.mockReturnValueOnce(makeChain([{ id: 9 }]));
    lessonAccess.getCourseSlugForLessonId.mockResolvedValue('flight-basics');

    await setLessonVideo(9, 'mux', 'ref-123');

    expect(lessonAccess.getCourseSlugForLessonId).toHaveBeenCalledWith(9);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('setLessonVideo skips invalidation when the lesson does not exist', async () => {
    db.update.mockReturnValueOnce(makeChain([]));

    const result = await setLessonVideo(999, 'mux', 'ref-123');

    expect(result).toBeNull();
    expect(lessonAccess.getCourseSlugForLessonId).not.toHaveBeenCalled();
    expect(courseCache.invalidate).not.toHaveBeenCalled();
  });

  it('reorderModule invalidates the owning course, resolved from moduleId', async () => {
    db.update.mockReturnValueOnce(makeChain([{ id: 7, rank: '2' }]));
    lessonAccess.getCourseSlugForModuleId.mockResolvedValue('flight-basics');

    await reorderModule({ moduleId: 7, prevModuleId: 1, nextModuleId: null });

    expect(lessonAccess.getCourseSlugForModuleId).toHaveBeenCalledWith(7);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('moveLesson invalidates both the source and target course when they differ', async () => {
    lessonAccess.getCourseSlugForLessonId.mockResolvedValue('source-course');
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
    expect(lessonAccess.getCourseSlugForLessonId).toHaveBeenCalledWith(9);
    expect(lessonAccess.getCourseSlugForModuleId).toHaveBeenCalledWith(20);
    expect(courseCache.invalidate).toHaveBeenCalledWith('source-course');
    expect(courseCache.invalidate).toHaveBeenCalledWith('target-course');
    expect(courseCache.invalidate).toHaveBeenCalledTimes(2);
  });

  it('moveLesson invalidates only once when source and target course are the same', async () => {
    lessonAccess.getCourseSlugForLessonId.mockResolvedValue('flight-basics');
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
    lessonAccess.getCourseSlugForLessonId.mockResolvedValue('flight-basics');

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
    lessonAccess.getCourseSlugForLessonId.mockResolvedValue('flight-basics');

    await updateLessonConfig(9, { isAvailable: true });

    expect(lessonAccess.getCourseSlugForLessonId).toHaveBeenCalledWith(9);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('deleteLesson invalidates the owning course, resolved before the row is gone', async () => {
    lessonAccess.getCourseSlugForLessonId.mockResolvedValue('flight-basics');
    db.delete.mockReturnValueOnce(makeChain([{ id: 9 }]));

    const result = await deleteLesson(9);

    expect(result).toBe(true);
    expect(courseCache.invalidate).toHaveBeenCalledWith('flight-basics');
  });

  it('deleteLesson skips invalidation when nothing was deleted', async () => {
    lessonAccess.getCourseSlugForLessonId.mockResolvedValue('flight-basics');
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
    lessonAccess.getCourseSlugForLessonId.mockResolvedValue('flight-basics');
    courseCache.invalidate.mockRejectedValueOnce(new Error('redis down'));

    await expect(setLessonVideo(9, 'mux', 'ref-123')).resolves.toEqual({
      id: 9,
    });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
