// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import type { Captured } from './support/capture-db';

/**
 * Task 6b: "which courses teach this lesson" is a MEMBERSHIP question.
 *
 * `getCourseIdsForLesson` and `getCourseIdsForLessons` used to walk
 * placement → module → `modules.course_id`: the module's OWNER, not the
 * courses it is placed in. Once a module can sit in a course it is not owned
 * by, Task 6a's playback-cache `invalidate` (one key per course id this
 * reports) and the admin routes' existence checks would both miss that
 * course. Both now join `course_modules` on the module and read ITS
 * `course_id`.
 *
 * Every assertion is on the exact expression the query builder was handed —
 * the joined table by identity, the ON condition and WHERE rendered to full
 * SQL text (`toBe`, located by index) — never on canned rows, which a
 * chainable stub returns regardless of the query built.
 *
 * `#/db` is one `captureDb` per file; its arrays and result queue are
 * emptied per test. The real `#/db/schema` is loaded so `eq`/`inArray`/
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
  return { captured, results: [] as unknown[][], db: null as unknown };
});
async function captureModule() {
  if (cap.db === null) {
    const { captureDb } = await import('./support/capture-db');
    const { db, captured, results } = captureDb();
    Object.assign(cap.captured, captured);
    cap.results = results;
    cap.db = db;
  }
  return { db: cap.db };
}
vi.mock('#/db', captureModule);

// The write functions' collaborators, stubbed so the module loads without
// dragging `#/db/course` (which imports `@/db/schema`, unresolvable under
// vitest) in through `#/db/course-cache`. Nothing here exercises a write.
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(),
  getCourseSlugsForModuleId: vi.fn(),
  lessonBelongsToCourseOrg: vi.fn(),
}));
vi.mock('#/db/course-modules', () => ({
  courseModuleIds: vi.fn((courseId: number) => `SUBQUERY:${courseId}`),
}));

const { courseModulesTable, moduleLessonsTable } = await import('#/db/schema');
const { getCourseIdsForLesson, getCourseIdsForLessons } = await import(
  '#/db/placements'
);

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of Object.values(cap.captured)) list.length = 0;
  cap.results.length = 0;
});

describe('getCourseIdsForLesson reads membership, not module ownership', () => {
  /**
   * Mutant this catches — the shipped code: `.innerJoin(modulesTable, ...)`
   * selecting `modulesTable.courseId`. Same shape, same row count today,
   * and the wrong answer the day a module is placed in a second course.
   */
  it('joins course_modules on the placement module and selects its course id', async () => {
    cap.results.push([{ courseId: 2 }, { courseId: 6 }]);

    const ids = await getCourseIdsForLesson(9);

    expect(cap.captured.from[0]).toBe(moduleLessonsTable);
    expect(cap.captured.joins).toHaveLength(1);
    expect(cap.captured.joins[0]).toBe(courseModulesTable);
    expect(renderSql(cap.captured.joinOn[0] as SQL)).toBe(
      '"course_modules"."module_id" = "module_lessons"."module_id"',
    );
    // The projection is the placement table's course column, by identity —
    // not `modules.course_id` under the same alias.
    expect((cap.captured.select[0] as { courseId: unknown }).courseId).toBe(
      courseModulesTable.courseId,
    );
    expect(renderSql(cap.captured.where[0] as SQL)).toBe(
      '"module_lessons"."lesson_id" = $1',
    );
    expect(renderSqlParams(cap.captured.where[0] as SQL)).toEqual([9]);
    expect(ids).toEqual([2, 6]);
  });
});

describe('getCourseIdsForLessons lists distinct member courses per lesson', () => {
  /**
   * Mutant this catches: selecting `modulesTable.courseId` (the OWNER) —
   * the library card would then say "in 1 course" and the video preview
   * would be signed with the owner's credentials for a lesson whose module
   * is placed in two courses.
   */
  it('joins course_modules on the placement module and groups its course ids by lesson, ascending', async () => {
    cap.results.push([
      { lessonId: 9, courseId: 6 },
      { lessonId: 9, courseId: 2 },
      { lessonId: 9, courseId: 6 },
      { lessonId: 10, courseId: 2 },
    ]);

    const ids = await getCourseIdsForLessons([9, 10]);

    expect(cap.captured.from[0]).toBe(moduleLessonsTable);
    expect(cap.captured.joins).toHaveLength(1);
    expect(cap.captured.joins[0]).toBe(courseModulesTable);
    expect(renderSql(cap.captured.joinOn[0] as SQL)).toBe(
      '"course_modules"."module_id" = "module_lessons"."module_id"',
    );
    expect(cap.captured.select[0]).toEqual({
      lessonId: moduleLessonsTable.lessonId,
      courseId: courseModulesTable.courseId,
    });
    expect(renderSql(cap.captured.where[0] as SQL)).toBe(
      '"module_lessons"."lesson_id" in ($1, $2)',
    );
    expect(renderSqlParams(cap.captured.where[0] as SQL)).toEqual([9, 10]);
    // Deduplicated and sorted, so "the first course teaching it" is stable.
    expect(ids.get(9)).toEqual([2, 6]);
    expect(ids.get(10)).toEqual([2]);
    expect(ids.has(11)).toBe(false);
  });

  it('issues no query for an empty id list', async () => {
    const ids = await getCourseIdsForLessons([]);
    expect(ids.size).toBe(0);
    expect(cap.captured.from).toHaveLength(0);
  });
});
