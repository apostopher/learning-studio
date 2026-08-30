// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

// Task 8: `#/db/editor.ts` reads the org-level library (lessons grouped by
// discipline, org-scoped) and the org's rail of course boards. Real `pgTable`
// stubs for the tables this module actually queries, `#/db`, `#/db/admin`
// and `#/db/placements` fully mocked — never `importOriginal` (see memory:
// vitest can't resolve @/, use #/).
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  name: text('name'),
  slug: text('slug'),
  isAvailable: boolean('is_available'),
  videoRef: text('video_ref'),
  disciplineId: integer('discipline_id'),
  orgId: integer('org_id'),
});
const disciplinesTable = pgTable('disciplines', {
  id: integer('id').primaryKey(),
  name: text('name'),
  slug: text('slug'),
  orgId: integer('org_id'),
});
const courseOrgsTable = pgTable('course_orgs', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  orgId: integer('org_id'),
});

/**
 * Chainable stub for a single drizzle query — house pattern from
 * `placements.test.ts`. Ignores every argument, so it can drive control flow
 * and canned rows but can't prove which table/column a query actually
 * targeted.
 */
function makeChain(result: unknown) {
  const p = Promise.resolve(result) as Promise<unknown> &
    Record<string, () => unknown>;
  Object.assign(p, {
    from: () => p,
    leftJoin: () => p,
    where: () => p,
  });
  return p;
}

/**
 * Variant of `makeChain` that records every condition passed to `.where()`,
 * in call order — modelled on `makeCapturingChain` in
 * `library-placement-scoping.test.ts`. Needed to prove the org scope: plain
 * `makeChain` discards its arguments, so a query with no WHERE at all (every
 * org's lessons) would satisfy every other test in this file.
 */
function makeCapturingChain(result: unknown, whereCalls: SQL[]) {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: (condition: SQL) => {
      whereCalls.push(condition);
      return chain;
    },
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const db = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({
  lessonsTable,
  disciplinesTable,
  courseOrgsTable,
}));
vi.mock('#/db/admin', () => ({ getCourseBoard: vi.fn() }));
vi.mock('#/db/placements', () => ({ getCourseCountsForLessons: vi.fn() }));

const { getOrgLibrary, getOrgEditorBoard } = await import('#/db/editor');
const { getCourseBoard } = await import('#/db/admin');
const { getCourseCountsForLessons } = await import('#/db/placements');

const mockGetCourseBoard = vi.mocked(getCourseBoard);
const mockGetCourseCounts = vi.mocked(getCourseCountsForLessons);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no lesson is in any course, so a test that doesn't care about
  // course counts still gets a defined map back rather than undefined.
  mockGetCourseCounts.mockResolvedValue(new Map());
});

describe('getOrgLibrary', () => {
  it('files a null-discipline lesson under untitled, not a discipline', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 9,
          name: 'Stalls',
          slug: 'stalls',
          isAvailable: true,
          videoRef: 'abc',
          disciplineId: null,
          disciplineName: null,
          disciplineSlug: null,
        },
      ]),
    );

    const lib = await getOrgLibrary(1);

    expect(lib.untitled.map((l) => l.id)).toEqual([9]);
    // Mutant this catches: an implementation that always builds a synthetic
    // "Untitled" discipline row instead of the separate `untitled` array
    // would leave `disciplines` non-empty here.
    expect(lib.disciplines.flatMap((d) => d.lessons)).toEqual([]);
  });

  it('groups a lesson under its real discipline, not untitled', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 4,
          name: 'Loops',
          slug: 'loops',
          isAvailable: true,
          videoRef: 'ref',
          disciplineId: 7,
          disciplineName: 'Aerobatics',
          disciplineSlug: 'aerobatics',
        },
      ]),
    );

    const lib = await getOrgLibrary(1);

    // Mutant this catches: swapping the `row.disciplineId === null` branch
    // condition (e.g. always taking the untitled branch, or checking
    // `!row.disciplineId` and mis-treating id `0` as untitled) would either
    // leave `disciplines` empty or misclassify this lesson.
    expect(lib.untitled).toEqual([]);
    expect(lib.disciplines).toHaveLength(1);
    expect(lib.disciplines[0]).toMatchObject({
      id: 7,
      name: 'Aerobatics',
      slug: 'aerobatics',
    });
    expect(lib.disciplines[0].lessons.map((l) => l.id)).toEqual([4]);
  });

  it("carries the course count each card shows", async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 9,
          name: 'Stalls',
          slug: 'stalls',
          isAvailable: true,
          videoRef: 'abc',
          disciplineId: null,
          disciplineName: null,
          disciplineSlug: null,
        },
      ]),
    );
    mockGetCourseCounts.mockResolvedValue(new Map([[9, 2]]));

    const lib = await getOrgLibrary(1);

    // Mutant this catches: hardcoding `courseCount: 0` (or any constant)
    // instead of reading the counts map keyed by lesson id.
    expect(lib.untitled[0].courseCount).toBe(2);
  });

  it('gives an unplaced lesson a count of zero rather than omitting it', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        {
          id: 9,
          name: 'Stalls',
          slug: 'stalls',
          isAvailable: true,
          videoRef: 'abc',
          disciplineId: null,
          disciplineName: null,
          disciplineSlug: null,
        },
      ]),
    );
    mockGetCourseCounts.mockResolvedValue(new Map());

    const lib = await getOrgLibrary(1);

    // Mutant this catches: filtering the lesson list down to `counts.has(id)`
    // before building cards — the lesson would vanish instead of reporting 0.
    expect(lib.untitled).toHaveLength(1);
    expect(lib.untitled[0].courseCount).toBe(0);
  });

  it('scopes the lesson query to this org, not every org', async () => {
    const whereCalls: SQL[] = [];
    db.select.mockReturnValueOnce(makeCapturingChain([], whereCalls));

    await getOrgLibrary(9);

    expect(whereCalls).toHaveLength(1);
    // Mutant this catches: scoping by `disciplines.org_id` instead of
    // `lessons.org_id` (both exist in the schema — the wrong one would still
    // "look" org-scoped), or dropping the WHERE and returning every org's
    // library.
    expect(renderSql(whereCalls[0])).toBe('"lessons"."org_id" = $1');
    expect(renderSqlParams(whereCalls[0])).toEqual([9]);
  });
});

describe('getOrgEditorBoard', () => {
  it("returns one board per course the org has via course_orgs", async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ courseId: 11 }, { courseId: 22 }]),
    );
    const boardFor = (courseId: number) => ({
      course: { id: courseId, name: `Course ${courseId}`, slug: `c${courseId}`, description: null, imageUrlAvif: null, imageUrlWebp: null },
      modules: [],
    });
    mockGetCourseBoard.mockImplementation(async (courseId: number) =>
      boardFor(courseId),
    );

    const boards = await getOrgEditorBoard(3);

    // Assert on what the consumer (getCourseBoard) actually received, not
    // just that *some* two boards came back — a mutant that called
    // getCourseBoard(11) twice (ignoring the second row) would still return
    // an array of length 2 with plausible-looking content.
    expect(mockGetCourseBoard.mock.calls).toEqual([[11], [22]]);
    expect(boards.map((b) => b.course.id)).toEqual([11, 22]);
  });

  it('drops a course whose board resolves to null rather than returning it', async () => {
    db.select.mockReturnValueOnce(makeChain([{ courseId: 11 }]));
    mockGetCourseBoard.mockResolvedValue(null);

    const boards = await getOrgEditorBoard(3);

    expect(boards).toEqual([]);
  });
});
