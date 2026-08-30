// @vitest-environment node
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
} from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

/**
 * db/course.ts pulls in the real drizzle client, `@/db/schema` (whose
 * `@/types` value import vitest cannot resolve — see memory: vitest can't
 * resolve @/, use #/), `@/integrations/upstash/redis` (a real
 * `Redis.fromEnv()` client construction at module scope), `#/db/admin`, and
 * `#/db/course-last-viewed-batch`. None of that machinery is exercised by
 * `getCourseDetails` itself — only `getMyCourses`/`getCourseDetailsWithCache`
 * touch it — so, following the repo's established "fully stub, never
 * importOriginal an internal module with `@/` value imports" pattern (real
 * pgTable columns so `eq`/`leftJoin`/`inArray` build real query fragments
 * against them; see admin-course-cache-invalidation.test.ts), everything else
 * is stubbed just enough to let the module load and the two queries
 * `getCourseDetails` issues resolve with controlled rows.
 */
const coursesTable = pgTable('courses', {
  id: integer('id').primaryKey(),
  name: text('name'),
  slug: text('slug'),
  description: text('description'),
  imageUrlAvif: text('image_url_avif'),
  imageUrlWebp: text('image_url_webp'),
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
  otherVideoIds: jsonb('other_video_ids'),
  videoProvider: text('video_provider'),
  videoRef: text('video_ref'),
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

/** Same chainable stub as admin-course-cache-invalidation.test.ts. */
function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders (awaitable without a terminal `.returning()`/`.orderBy()`)
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const db = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('#/db', () => ({ db }));
vi.mock('@/db/schema', () => ({
  coursesTable,
  modulesTable,
  lessonsTable,
  moduleLessonsTable,
  moduleDependenciesTable,
  orgLessonsTable,
  orgsTable,
  courseSubscriptionsTable: {},
  videoProgressTable: {},
  lessonMaterialProgressTable: {},
}));
vi.mock('@/integrations/upstash/redis', () => ({
  cacheWithRedis: (_prefix: string, fn: unknown) => fn,
}));
vi.mock('#/db/admin', () => ({ getUserRoleNames: vi.fn() }));
vi.mock('#/db/course-last-viewed-batch', () => ({
  getLastViewedLessonIdsByCourse: vi.fn(),
}));
// getMyCourses now resolves a level per card. Stubbed like every other
// internal module here: the real one value-imports `#/db/schema`, which
// value-imports `@/types` — the alias vitest cannot resolve.
vi.mock('#/db/user-levels', () => ({ getCurrentLevelsByCourse: vi.fn() }));

const { getCourseDetails } = await import('#/db/course');

const courseWithModuleRow = {
  course: {
    id: 1,
    name: 'Flight Basics',
    slug: 'flight-basics',
    description: null,
    imageUrlAvif: null,
    imageUrlWebp: null,
  },
  module: {
    id: 10,
    name: 'M1',
    slug: 'm1',
    imageUrlAvif: null,
    imageUrlWebp: null,
    rank: '1',
    requiredSubscriptions: [],
  },
};

const lessonRow = (lesson: {
  id: number;
  slug: string;
  videoProvider: string | null;
  videoRef: string | null;
}) => ({
  lesson: {
    id: lesson.id,
    moduleId: 10,
    name: lesson.slug,
    slug: lesson.slug,
    rank: '1',
    isAvailable: true,
    hasDebrief: false,
    needsVideoWatch: true,
    requiredSubscriptions: [],
    otherVideoIds: [],
    videoProvider: lesson.videoProvider,
    videoRef: lesson.videoRef,
  },
  placement: {
    id: lesson.id,
    moduleId: 10,
    lessonId: lesson.id,
    rank: '1',
    dependsOn: [],
  },
  moduleDep: null,
  orgLesson: null,
  org: null,
});

/**
 * Regression guard for `hasVideo` (db/course.ts:120) — the field every
 * consumer outside the playback layer gates on: prerequisite satisfaction
 * (`isLessonSatisfied`) and whether the learner player renders a video at all
 * (`compute-lesson-main-state.ts`). Nothing previously exercised the actual
 * derivation — only its PRESENCE downstream (course-content-gating.test.ts,
 * routes/api/course/__tests__/details.test.ts hand it fixtures with the value
 * already baked in) — so inverting `&&` to `||`, or comparing the wrong
 * column, would ship silently and open prerequisite gating for every lesson
 * on the platform.
 */
describe('getCourseDetails — hasVideo derivation', () => {
  it('is true only when both videoProvider and videoRef are set', async () => {
    db.select
      .mockReturnValueOnce(makeChain([courseWithModuleRow]))
      .mockReturnValueOnce(
        makeChain([
          lessonRow({
            id: 100,
            slug: 'has-video',
            videoProvider: 'mux',
            videoRef: 'abc123',
          }),
          lessonRow({
            id: 101,
            slug: 'no-provider',
            videoProvider: null,
            videoRef: 'abc123',
          }),
          lessonRow({
            id: 102,
            slug: 'no-ref',
            videoProvider: 'mux',
            videoRef: null,
          }),
          lessonRow({
            id: 103,
            slug: 'no-video',
            videoProvider: null,
            videoRef: null,
          }),
        ]),
      )
      // The `inArray(moduleLessonsTable.moduleId, db.select(...)...)` subquery
      // embedded in the lessonData query's `.where()` — constructed but
      // never awaited on its own, so its content is irrelevant.
      .mockReturnValueOnce(makeChain([]));

    const details = await getCourseDetails('flight-basics');

    const lessons = details?.modules[0]?.lessons ?? [];
    const hasVideoBySlug = Object.fromEntries(
      lessons.map((l) => [l.slug, l.hasVideo]),
    );
    expect(hasVideoBySlug).toEqual({
      'has-video': true,
      'no-provider': false,
      'no-ref': false,
      'no-video': false,
    });
  });
});
