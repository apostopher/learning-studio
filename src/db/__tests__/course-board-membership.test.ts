// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import type { Captured } from './support/capture-db';

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
  return { captured, results: [] as unknown[][] };
});
vi.mock('#/db', async () => {
  const { captureDb } = await import('./support/capture-db');
  const { db, captured, results } = captureDb();
  Object.assign(cap.captured, captured);
  cap.results = results;
  return { db };
});
const membership = vi.hoisted(() => ({
  courseModuleIds: vi.fn(() => 'SUBQUERY'),
}));
vi.mock('#/db/course-modules', () => membership);

// admin.ts drags in server-only modules at import time (Redis clients,
// crypto, video-provider resolvers). None are exercised by `getCourseBoard`;
// stubbed wholesale, never `importOriginal` — same list as
// course-board-placements.test.ts.
vi.mock('#/db/course-cache', () => ({
  invalidateCourseDetailsCache: vi.fn(),
}));
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(),
  getCourseSlugForCourseId: vi.fn(),
  getCourseSlugForLessonId: vi.fn(),
  getCourseSlugForModuleId: vi.fn(),
  getCourseSlugsForLessonId: vi.fn(),
  lessonBelongsToCourseOrg: vi.fn(),
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

const { getPlacementsForCourse } = await import('../placements');
const { getCourseBoard } = await import('../admin');
const { courseModulesTable, modulesTable } = await import('../schema');

beforeEach(() => {
  vi.clearAllMocks();
  // The capture arrays are shared by every test in this file (one `#/db`
  // mock); empty them in place so index-based assertions are per-test.
  for (const list of Object.values(cap.captured)) list.length = 0;
  cap.results.length = 0;
});

/**
 * `getCourseBoard` returns `null` when the course lookup resolves `[]`, so
 * the first awaited chain must hand back a course row for control flow to
 * reach the module query under test. Every later chain resolves `[]`.
 */
function seedCourse() {
  cap.results.push([{ id: 2, name: 'Course', slug: 'c' }]);
}

describe('course board membership', () => {
  /**
   * The assertion is that this read path ASKS the membership helper — not that
   * some SQL string happens to contain a table name. One definition of
   * membership is the whole point; a path that hand-rolls the same join is the
   * mutant, and it passes any test that only checks the rendered SQL.
   */
  it('scopes placements through the membership helper', async () => {
    await getPlacementsForCourse(2);
    expect(membership.courseModuleIds).toHaveBeenCalledWith(2);
  });

  /**
   * Mutant: ordering by `modules.rank`. It compiles, and it looks right until
   * two courses order the same module differently. Rendered with the house
   * `renderSql` (a drizzle SQL object does not stringify to SQL), asserted
   * `toBe` on the full text of each captured expression by index.
   *
   * Capture order for `getCourseBoard(2)`: [0] the course lookup, [1] the
   * module query (built first inside `Promise.all`), [2] the placements
   * query from `getPlacementsForCourse`.
   */
  it('orders the board by the placement rank, not the module rank', async () => {
    seedCourse();
    await getCourseBoard(2);

    // FROM course_modules, INNER JOIN modules on the placement's module id.
    expect(cap.captured.from[1]).toBe(courseModulesTable);
    expect(cap.captured.joins[0]).toBe(modulesTable);
    expect(renderSql(cap.captured.joinOn[0] as SQL)).toBe(
      '"modules"."id" = "course_modules"."module_id"',
    );
    // WHERE pins the placement's course, with the caller's id bound.
    expect(renderSql(cap.captured.where[1] as SQL)).toBe(
      '"course_modules"."course_id" = $1',
    );
    expect(renderSqlParams(cap.captured.where[1] as SQL)).toEqual([2]);
    // ORDER BY the placement rank, then module id as the tiebreak.
    expect(renderSql(cap.captured.orderBy[0] as SQL)).toBe(
      '"course_modules"."rank" asc',
    );
    expect(renderSql(cap.captured.orderBy[1] as SQL)).toBe(
      '"modules"."id" asc',
    );
  });

  /**
   * `BoardModule.rank` must be the PLACEMENT's rank, so the select has to name
   * `course_modules.rank` for that field — a select that still reads
   * `modules.rank` would order correctly and then report the wrong number.
   */
  it("selects the placement's rank as the module's rank", async () => {
    seedCourse();
    await getCourseBoard(2);
    const fields = cap.captured.select[1] as { rank: unknown };
    expect(fields.rank).toBe(courseModulesTable.rank);
  });
});
