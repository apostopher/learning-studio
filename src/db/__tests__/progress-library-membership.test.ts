// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import type { Captured } from './support/capture-db';

/**
 * Task 5: the last two membership readers move off `modules.course_id`.
 *
 * `getCourseProgress` (`#/db/course-progress`) JOINS `course_modules` rather
 * than filtering through the helper, because it must ORDER BY (and therefore
 * GROUP BY) the placement's rank — a filter subquery cannot supply that
 * column. `getLibraryForCourse` and `getCourseSlugsForLibraryFile`
 * (`#/db/library`) have no ordering, so the scoping branches take the
 * helper's subquery and the course-for-display join goes through the
 * placement table.
 *
 * Every assertion is on the exact expression the query builder was handed
 * (`renderSql`, full-string `toBe`, located by index), never on canned rows.
 * The mutant each one exists to catch is the half-migration: a query that
 * joins the placement table but still filters, groups or orders on the
 * module row — it compiles, matches today's one-placement-per-module data,
 * and drifts the moment a module is placed in a second course.
 *
 * `#/db` is one `captureDb` per file; its arrays and result queue are
 * emptied per test. The real `#/db/schema` is loaded so `eq`/`asc`/`inArray`
 * build real drizzle trees against the real column names. The membership
 * helper returns an id-bearing sentinel, so a rendered parameter proves the
 * consumer received the subquery FOR THAT COURSE, not just that the helper
 * ran somewhere.
 */
const cap = vi.hoisted(() => {
  // `captureDb` cannot be imported inside vi.hoisted, so the arrays are
  // declared here and rebound to the helper's own arrays in the `#/db` mock.
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
// library.ts imports `#/db`, course-progress.ts imports `@/db` (which vitest
// cannot resolve on its own — see memory). Both aliases are mocked to the
// SAME capture chain, built once on whichever factory runs first, so a test
// reads one `cap.captured` regardless of which module issued the query.
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
vi.mock('@/db', captureModule);
const membership = vi.hoisted(() => ({
  courseModuleIds: vi.fn((courseId: number) => `SUBQUERY:${courseId}`),
  getCourseModuleIds: vi.fn(async () => []),
}));
vi.mock('#/db/course-modules', () => membership);

// course-progress.ts imports the schema through the `@/` alias; it is
// re-exported REAL through `#/` (same objects, so table identity survives).
// The shared progress-component columns are stubbed to a no-op — they are
// not what this file is about and they would only widen the SELECT.
vi.mock('@/db/schema', () => vi.importActual('#/db/schema'));
vi.mock('#/db/progress-components', () => ({
  progressComponentColumns: () => ({}),
  progressComponentGroupBy: [],
  toComponentFields: () => ({}),
}));

const { getCourseProgress } = await import('../course-progress');
const { getLibraryForCourse, getCourseSlugsForLibraryFile } = await import(
  '../library'
);
const { courseModulesTable, modulesTable } = await import('#/db/schema');

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of Object.values(cap.captured)) list.length = 0;
  cap.results.length = 0;
});

describe('getCourseProgress', () => {
  /**
   * Join order: [0] course_modules INNER on the course, [1] modules INNER on
   * the placement's module id. INNER is right here — a course with no
   * placements has no progress rows to aggregate — and the two LEFT joins
   * that follow (module_lessons, lessons) are pinned by
   * learner-read-placements.test.ts.
   */
  it('joins modules through course_modules, not modules.course_id', async () => {
    await getCourseProgress({ userId: 'u1', slug: 'itps-uas-remote' });

    expect(cap.captured.joins[0]).toBe(courseModulesTable);
    expect(renderSql(cap.captured.joinOn[0] as SQL)).toBe(
      '"course_modules"."course_id" = "courses"."id"',
    );
    expect(cap.captured.joins[1]).toBe(modulesTable);
    expect(renderSql(cap.captured.joinOn[1] as SQL)).toBe(
      '"modules"."id" = "course_modules"."module_id"',
    );
  });

  /**
   * ORDER BY [0] is the placement's rank; [1] the lesson placement's. The
   * mutant keeps `asc(modules.rank)` after switching the join — the rows
   * still come back, in whichever order the module was authored in rather
   * than this course's.
   */
  it("orders modules by the placement's rank, not modules.rank", async () => {
    await getCourseProgress({ userId: 'u1', slug: 'itps-uas-remote' });

    expect(renderSql(cap.captured.orderBy[0] as SQL)).toBe(
      '"course_modules"."rank" asc',
    );
    expect(renderSql(cap.captured.orderBy[1] as SQL)).toBe(
      '"module_lessons"."rank" asc',
    );
  });

  /**
   * The grouped query orders by a column that is not an aggregate, so
   * Postgres requires it in the GROUP BY. Switching the ORDER BY but leaving
   * the old `modules.rank` in the GROUP BY passed every join/order assertion
   * above and failed at runtime with "column course_modules.rank must appear
   * in the GROUP BY clause". Column identity is asserted — that is exactly
   * what the builder was handed. (The `not.toContain(modulesTable.rank)`
   * half of this pin went with the column in Task 7: that mutant no longer
   * type-checks, so it needs no runtime guard.)
   */
  it("groups by the placement's rank", async () => {
    await getCourseProgress({ userId: 'u1', slug: 'itps-uas-remote' });

    expect(cap.captured.groupBy[0]).toBe(modulesTable.id);
    expect(cap.captured.groupBy[1]).toBe(courseModulesTable.rank);
  });
});

describe('getLibraryForCourse', () => {
  /**
   * Library files resolve to a course two ways: through the lesson's placed
   * module, and — for a file attached to a MODULE with no lesson — through
   * the module itself. Both branches are membership reads, so both take the
   * helper's subquery: `lesson_module.id in <helper>` and, under the
   * lesson-is-null guard, `modules.id in <helper>`. The boolean shape of the
   * `or(...)` is pinned in full, and the two bound parameters carry the
   * course id the helper was handed — a branch left on `course_id = $n`
   * renders a different string, and a helper called with the wrong id
   * renders a different parameter.
   */
  it('scopes both the lesson and the module branch through the membership helper', async () => {
    await getLibraryForCourse(2);

    expect(membership.courseModuleIds).toHaveBeenCalledTimes(2);
    expect(membership.courseModuleIds).toHaveBeenCalledWith(2);
    expect(renderSql(cap.captured.where[0] as SQL)).toBe(
      '("blob_files"."url" like $1 and ("lesson_module"."id" in $2 or ("lessons"."id" is null and "modules"."id" in $3)))',
    );
    expect(renderSqlParams(cap.captured.where[0] as SQL)).toEqual([
      '%/library-%',
      'SUBQUERY:2',
      'SUBQUERY:2',
    ]);
  });
});

describe('getCourseSlugsForLibraryFile', () => {
  /**
   * Both course-for-display lookups go through the placement table, each
   * keeping its `coursesTable` alias so the `viaLesson ?? viaModule` rule
   * downstream is untouched. Join order: [0] modules off the assignment,
   * [1] course_modules off the module, [2] module_course off the placement;
   * [3] lessons, [4] module_lessons, [5] lesson_module as before; [6] the
   * aliased placement off lesson_module, [7] lesson_course off it. The
   * mutant is either alias join still reading `<module>.course_id`.
   */
  it('resolves a course for display through course_modules on both the module and the lesson side', async () => {
    await getCourseSlugsForLibraryFile(9);

    expect(cap.captured.joins[1]).toBe(courseModulesTable);
    expect(renderSql(cap.captured.joinOn[1] as SQL)).toBe(
      '"course_modules"."module_id" = "modules"."id"',
    );
    expect(renderSql(cap.captured.joinOn[2] as SQL)).toBe(
      '"module_course"."id" = "course_modules"."course_id"',
    );
    expect(renderSql(cap.captured.joinOn[5] as SQL)).toBe(
      '"lesson_module"."id" = "module_lessons"."module_id"',
    );
    expect(renderSql(cap.captured.joinOn[6] as SQL)).toBe(
      '"lesson_module_placement"."module_id" = "lesson_module"."id"',
    );
    expect(renderSql(cap.captured.joinOn[7] as SQL)).toBe(
      '"lesson_course"."id" = "lesson_module_placement"."course_id"',
    );
  });
});
