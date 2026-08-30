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

// admin.ts drags in a long tail of server-only modules (crypto.server,
// resolve.server, posters.server, Redis clients) — same landmine documented
// in admin-course-cache-invalidation.test.ts. Following that file's "fully
// stub, never importOriginal" pattern: real pgTable columns (just enough for
// eq/inArray/sql to build real query fragments), plain stubs everywhere else.
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
  sequentialLessons: boolean('sequential_lessons'),
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
  levels: jsonb('levels'),
  videoProvider: text('video_provider'),
  videoRef: text('video_ref'),
});
const moduleDependenciesTable = pgTable('module_dependencies', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  dependsOn: jsonb('depends_on'),
});
const lessonDependenciesTable = pgTable('lesson_dependencies', {
  id: integer('id').primaryKey(),
  lessonId: integer('lesson_id'),
  dependsOn: jsonb('depends_on'),
});
const videoProgressTable = pgTable('videos_progress', {
  id: integer('id').primaryKey(),
  userId: text('user_id'),
  lessonId: integer('lesson_id'),
  progress: integer('progress'),
  createdAt: timestamp('created_at'),
});
const courseVideoProvidersTable = pgTable('course_video_providers', {
  id: integer('id').primaryKey(),
});
const newsSourcesTable = pgTable('news_sources', {
  id: integer('id').primaryKey(),
});

/**
 * A chainable stub standing in for a single drizzle query builder. Every
 * builder method returns the same thenable object so any subset/order of
 * calls (from/innerJoin/leftJoin/where/orderBy/groupBy/limit) keeps
 * chaining, and awaiting it resolves to `result` — matching the house
 * pattern in src/db/__tests__/placements.test.ts.
 */
function makeChain(result: unknown) {
  const p = Promise.resolve(result) as Promise<unknown> &
    Record<string, () => unknown>;
  Object.assign(p, {
    from: () => p,
    innerJoin: () => p,
    leftJoin: () => p,
    where: () => p,
    orderBy: () => p,
    groupBy: () => p,
    limit: () => p,
  });
  return p;
}

const getPlacementsForCourse = vi.hoisted(() => vi.fn());
vi.mock('#/db/placements', () => ({
  getPlacementsForCourse,
  getCourseIdsForLesson: vi.fn().mockResolvedValue([]),
  getCourseCountsForLessons: vi.fn().mockResolvedValue(new Map()),
}));

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({
  coursesTable,
  modulesTable,
  lessonsTable,
  moduleDependenciesTable,
  lessonDependenciesTable,
  videoProgressTable,
  courseVideoProvidersTable,
  newsSourcesTable,
}));
// admin.ts also imports these at module scope; none of them are exercised by
// getCourseBoard, but importing the real modules would drag in Redis clients
// and other env-dependent machinery — same reasoning as
// admin-course-cache-invalidation.test.ts.
vi.mock('#/db/course-cache', () => ({
  invalidateCourseDetailsCache: vi.fn(),
}));
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForCourseId: vi.fn(),
  getCourseSlugForLessonId: vi.fn(),
  getCourseSlugForModuleId: vi.fn(),
}));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: vi.fn() }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: vi.fn(),
  validateCredentials: vi.fn(),
}));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: Object.assign(vi.fn(), {
    invalidate: vi.fn(),
  }),
}));

const { getCourseBoard } = await import('#/db/admin');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCourseBoard', () => {
  it('orders a module’s lessons by PLACEMENT rank, not lesson rank', async () => {
    // Lesson 9 ranks 1 on the lesson row but 2 in this course; lesson 10 the
    // reverse. If the board still read lessons.rank the order would invert.
    db.select
      .mockReturnValueOnce(makeChain([{ id: 3, name: 'Course', slug: 'c' }])) // course
      .mockReturnValueOnce(makeChain([{ id: 4, name: 'Module', slug: 'm' }])); // modules
    getPlacementsForCourse.mockResolvedValue([
      { id: 1, moduleId: 4, lessonId: 10, rank: 1, dependsOn: [] },
      { id: 2, moduleId: 4, lessonId: 9, rank: 2, dependsOn: [] },
    ]);
    db.select
      .mockReturnValueOnce(
        makeChain([
          { id: 9, name: 'Lesson 9', slug: 'l9', rank: '1' },
          { id: 10, name: 'Lesson 10', slug: 'l10', rank: '2' },
        ]),
      ) // lessons
      .mockReturnValueOnce(makeChain([])) // module dependencies
      .mockReturnValueOnce(makeChain([])); // learner counts

    const board = await getCourseBoard(3);

    expect(board?.modules[0].lessons.map((l) => l.id)).toEqual([10, 9]);
  });

  it('takes dependsOn from the placement, so two courses can differ', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ id: 3, name: 'Course', slug: 'c' }]))
      .mockReturnValueOnce(makeChain([{ id: 4, name: 'Module', slug: 'm' }]));
    getPlacementsForCourse.mockResolvedValue([
      { id: 1, moduleId: 4, lessonId: 9, rank: 1, dependsOn: ['intro'] },
    ]);
    db.select
      .mockReturnValueOnce(
        makeChain([{ id: 9, name: 'Lesson 9', slug: 'l9', rank: '1' }]),
      )
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));

    const board = await getCourseBoard(3);

    expect(board?.modules[0].lessons[0].dependsOn).toEqual(['intro']);
  });

  it('omits a lesson that has no placement in this course', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ id: 3, name: 'Course', slug: 'c' }]))
      .mockReturnValueOnce(makeChain([{ id: 4, name: 'Module', slug: 'm' }]));
    getPlacementsForCourse.mockResolvedValue([]);
    db.select
      .mockReturnValueOnce(makeChain([])) // module dependencies
      .mockReturnValueOnce(makeChain([])); // learner counts

    const board = await getCourseBoard(3);

    expect(board?.modules[0].lessons).toEqual([]);
  });
});
