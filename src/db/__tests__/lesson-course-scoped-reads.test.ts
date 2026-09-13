// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import type { Captured } from './support/capture-db';

/**
 * Task 6a: the learner path stops inferring a lesson's course.
 *
 * The gate's course-slug inferrer, `lesson-playback.ts` and
 * `course-last-viewed.ts` each resolved lesson → module → course with
 * `.orderBy(courseId).limit(1)`
 * — an arbitrary pick among the courses teaching that lesson. Once a lesson
 * is in two courses, a learner in the second is gated, played and resumed
 * against the first. The fix is to take the course from the caller (the
 * route, ultimately) and check the lesson is PLACED in it through the
 * membership helper.
 *
 * Every assertion is on the exact expression the query builder was handed
 * (`renderSql`, full-string `toBe`, located by index) or on the argument a
 * collaborator received (`redis.get`/`set`/`del`, `insert().values()`). The
 * membership helper returns an id-bearing sentinel so a rendered parameter
 * proves the consumer received the subquery FOR THAT COURSE.
 *
 * `#/db` is one `captureDb` per file; its arrays and result queue are
 * emptied per test. The real `#/db/schema` is loaded so `eq`/`and`/`inArray`
 * build real drizzle trees against the real column names.
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
  return {
    captured,
    results: [] as unknown[][],
    db: null as unknown,
    /** Every `values` object handed to `db.insert().values()`. */
    inserted: [] as unknown[],
  };
});
async function captureModule() {
  if (cap.db === null) {
    const { captureDb } = await import('./support/capture-db');
    const { db, captured, results } = captureDb();
    Object.assign(cap.captured, captured);
    cap.results = results;
    // `captureDb` only models the read chain; the last-viewed write is an
    // upsert, so the insert side records what it was handed and resolves.
    db.insert = () => ({
      values: (v: unknown) => {
        cap.inserted.push(v);
        return { onConflictDoUpdate: () => Promise.resolve() };
      },
    });
    cap.db = db;
  }
  return { db: cap.db };
}
vi.mock('#/db', captureModule);

const membership = vi.hoisted(() => ({
  courseModuleIds: vi.fn((courseId: number) => `SUBQUERY:${courseId}`),
  getCourseModuleIds: vi.fn(async () => []),
}));
vi.mock('#/db/course-modules', () => membership);

// The gate's other collaborators. `getUserRoleNames` answers admin so the
// gate returns from the author-bypass branch: the lookup under test has run
// by then, and nothing after it is this file's concern.
const gate = vi.hoisted(() => ({
  getUserRoleNames: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  isCourseStaff: vi.fn(),
  getCurrentLevel: vi.fn(),
}));
const playback = vi.hoisted(() => ({
  resolveCourseProvider: vi.fn(),
  resolvePlayback: vi.fn(),
  getCourseIdsForLesson: vi.fn(),
}));
const redis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));
vi.mock('#/db/admin', () => ({
  getUserRoleNames: gate.getUserRoleNames,
  resolveCourseProvider: playback.resolveCourseProvider,
}));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: gate.getCourseDetailsWithCache,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: gate.getCourseProgress,
}));
vi.mock('#/db/course-staff', () => ({ isCourseStaff: gate.isCourseStaff }));
vi.mock('#/db/user-levels', () => ({ getCurrentLevel: gate.getCurrentLevel }));
vi.mock('#/integrations/upstash/redis', () => ({ redis }));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: playback.resolvePlayback,
}));
vi.mock('#/db/placements', () => ({
  getCourseIdsForLesson: playback.getCourseIdsForLesson,
}));

const { evaluateLessonGate } = await import('#/lib/lesson-gating.server');
const { getLessonPlayback } = await import('#/db/lesson-playback');
const { recordLastViewedLesson } = await import('#/db/course-last-viewed');
const lessonAccess = await import('#/db/lesson-access');

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of Object.values(cap.captured)) list.length = 0;
  cap.results.length = 0;
  cap.inserted.length = 0;
  gate.getUserRoleNames.mockResolvedValue(['admin']);
  gate.getCourseDetailsWithCache.mockResolvedValue({ modules: [] });
  gate.getCourseProgress.mockResolvedValue({ lessons: [] });
  gate.isCourseStaff.mockResolvedValue(false);
  gate.getCurrentLevel.mockResolvedValue('basic');
  playback.resolveCourseProvider.mockResolvedValue({ keyId: 'k' });
  playback.getCourseIdsForLesson.mockResolvedValue([]);
  redis.get.mockResolvedValue(null);
});

const ready = {
  status: 'ready' as const,
  url: 'https://cdn/v.m3u8',
  kind: 'hls' as const,
  expiresInSeconds: 90,
  poster: null,
  captions: null,
};

describe('evaluateLessonGate resolves the lesson inside the course it was given', () => {
  /**
   * Capture order: [0] the course by slug, [1] the lesson within it. The
   * lesson WHERE must pair the slug with the membership helper's subquery
   * for the SEEDED course id — the mutant is the shipped code: a lesson
   * lookup with no course filter at all, or one on `modules.course_id`.
   */
  it('filters the lesson through the membership helper for the seeded course', async () => {
    cap.results.push([{ id: 7 }], [{ isAvailable: true }]);

    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'radio-failure',
      courseSlug: 'b',
    });

    expect(renderSql(cap.captured.where[0] as SQL)).toBe(
      '"courses"."slug" = $1',
    );
    expect(renderSqlParams(cap.captured.where[0] as SQL)).toEqual(['b']);
    expect(membership.courseModuleIds).toHaveBeenCalledWith(7);
    expect(renderSql(cap.captured.where[1] as SQL)).toBe(
      '("lessons"."slug" = $1 and "module_lessons"."module_id" in $2)',
    );
    expect(renderSqlParams(cap.captured.where[1] as SQL)).toEqual([
      'radio-failure',
      'SUBQUERY:7',
    ]);
    // The course the gate reports downstream is the one it was handed, with
    // the id the course lookup resolved — never one inferred from the lesson.
    expect(result).toMatchObject({ courseSlug: 'b', courseId: 7 });
  });

  it('answers null for a lesson that is not placed in this course', async () => {
    cap.results.push([{ id: 7 }], []);

    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'radio-failure',
      courseSlug: 'b',
    });

    expect(result).toBeNull();
    // Nothing past the lookup ran — the same opaque outcome as an unknown
    // lesson, so the route's 403/404 reveals nothing about placement.
    expect(gate.getCourseDetailsWithCache).not.toHaveBeenCalled();
  });

  it('answers null for an unknown course without looking the lesson up', async () => {
    cap.results.push([]);

    const result = await evaluateLessonGate({
      userId: 'u1',
      lessonSlug: 'radio-failure',
      courseSlug: 'nope',
    });

    expect(result).toBeNull();
    expect(membership.courseModuleIds).not.toHaveBeenCalled();
    expect(cap.captured.where).toHaveLength(1);
  });

  it('still treats a WIP lesson as absent', async () => {
    cap.results.push([{ id: 7 }], [{ isAvailable: false }]);

    expect(
      await evaluateLessonGate({
        userId: 'u1',
        lessonSlug: 'draft',
        courseSlug: 'b',
      }),
    ).toBeNull();
  });
});

describe('getLessonPlayback is scoped and cached per course', () => {
  it('filters through the membership helper for the course it was given', async () => {
    cap.results.push([{ videoProvider: 'mux', videoRef: 'ref-1' }]);
    playback.resolvePlayback.mockResolvedValueOnce(ready);

    await getLessonPlayback('l1', { courseId: 6 });

    expect(membership.courseModuleIds).toHaveBeenCalledWith(6);
    expect(renderSql(cap.captured.where[0] as SQL)).toBe(
      '("lessons"."slug" = $1 and "module_lessons"."module_id" in $2)',
    );
    expect(renderSqlParams(cap.captured.where[0] as SQL)).toEqual([
      'l1',
      'SUBQUERY:6',
    ]);
    // No ORDER BY: there is nothing to pick between any more.
    expect(cap.captured.orderBy).toHaveLength(0);
    // The credentials are the given course's, not one read off the row.
    expect(playback.resolveCourseProvider).toHaveBeenCalledWith(6, 'mux');
  });

  it('reads and writes the cache under a key that names the course', async () => {
    cap.results.push([{ videoProvider: 'mux', videoRef: 'ref-1' }]);
    playback.resolvePlayback.mockResolvedValueOnce(ready);

    await getLessonPlayback('l1', { courseId: 6 });

    expect(redis.get).toHaveBeenCalledWith('lesson-playback:6:l1');
    expect(redis.set).toHaveBeenCalledWith(
      'lesson-playback:6:l1',
      JSON.stringify(ready),
      { ex: 60 },
    );
  });

  it('answers null for a lesson not placed in the course, without touching the provider', async () => {
    cap.results.push([]);

    expect(await getLessonPlayback('l1', { courseId: 6 })).toBeNull();
    expect(playback.resolveCourseProvider).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  /**
   * An admin video swap must evict the entry for EVERY course teaching the
   * lesson — one `del` per course id the plural helper reports, each under
   * the per-course key. The mutant deletes the old single per-lesson key,
   * which no reader consults any more.
   */
  it('invalidate evicts one key per course teaching the lesson', async () => {
    cap.results.push([{ id: 42 }]);
    playback.getCourseIdsForLesson.mockResolvedValueOnce([2, 6]);

    await getLessonPlayback.invalidate('l1');

    expect(renderSql(cap.captured.where[0] as SQL)).toBe(
      '"lessons"."slug" = $1',
    );
    expect(renderSqlParams(cap.captured.where[0] as SQL)).toEqual(['l1']);
    expect(playback.getCourseIdsForLesson).toHaveBeenCalledWith(42);
    expect(redis.del.mock.calls).toEqual([
      ['lesson-playback:2:l1'],
      ['lesson-playback:6:l1'],
    ]);
  });

  it('invalidate deletes nothing for a slug that matches no lesson', async () => {
    cap.results.push([]);

    await getLessonPlayback.invalidate('ghost');

    expect(playback.getCourseIdsForLesson).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });
});

describe('recordLastViewedLesson writes the pointer for the course it was given', () => {
  it('looks the lesson up through the membership helper and inserts that course id', async () => {
    cap.results.push([{ lessonId: 42 }]);

    const recorded = await recordLastViewedLesson({
      userId: 'u1',
      lessonSlug: 'l1',
      courseId: 6,
    });

    expect(recorded).toBe(true);
    expect(membership.courseModuleIds).toHaveBeenCalledWith(6);
    expect(renderSql(cap.captured.where[0] as SQL)).toBe(
      '("lessons"."slug" = $1 and "module_lessons"."module_id" in $2)',
    );
    expect(renderSqlParams(cap.captured.where[0] as SQL)).toEqual([
      'l1',
      'SUBQUERY:6',
    ]);
    expect(cap.captured.orderBy).toHaveLength(0);
    // The value the WRITE received: the caller's course, not one off a row.
    expect(cap.inserted).toEqual([{ userId: 'u1', courseId: 6, lessonId: 42 }]);
  });

  it('writes nothing for a lesson not placed in the course', async () => {
    cap.results.push([]);

    const recorded = await recordLastViewedLesson({
      userId: 'u1',
      lessonSlug: 'l1',
      courseId: 6,
    });

    expect(recorded).toBe(false);
    expect(cap.inserted).toEqual([]);
  });
});

describe('the inferring lookups are gone', () => {
  /**
   * The exact export set, so the three deleted inferrers — the learner
   * gate's slug lookup (Task 6a) and the admin path's course-id and
   * course-slug lookups by lesson id (Task 6b), each of which picked the
   * lowest course id among those teaching a lesson — cannot come back under
   * their old names, or any other. Every remaining single-course answer here
   * is keyed by a MODULE or a COURSE, which have exactly one owner; nothing
   * answers "the course" for a lesson, because a lesson has no such thing.
   * Adding an export is a deliberate act that updates this list.
   */
  it('lesson-access exports exactly the course-explicit readers', () => {
    expect(Object.keys(lessonAccess).sort()).toEqual([
      'getCourseIdForModuleId',
      'getCourseSlugForCourseId',
      'getCourseSlugForModuleId',
      'getCourseSlugsForLessonId',
      'getDisciplineIdForLessonId',
      'getLessonIdBySlug',
      'getLessonInCourse',
      'isSubscribedToCourse',
      'isSubscribedToCourseSlug',
      'lessonBelongsToCourseOrg',
    ]);
  });
});
