// @vitest-environment node
import { integer, jsonb, numeric, pgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const moduleLessonsTable = pgTable('module_lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  lessonId: integer('lesson_id'),
  rank: numeric('rank'),
  dependsOn: jsonb('depends_on'),
});
const modulesTable = pgTable('modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
});

function makeChain(result: unknown) {
  const p = Promise.resolve(result) as Promise<unknown> &
    Record<string, () => unknown>;
  Object.assign(p, {
    from: () => p,
    innerJoin: () => p,
    where: () => p,
    orderBy: () => p,
    groupBy: () => p,
  });
  return p;
}

const db = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ moduleLessonsTable, modulesTable }));

const {
  getPlacementsForCourse,
  getCourseIdsForLesson,
  getCourseCountsForLessons,
} = await import('#/db/placements');

beforeEach(() => vi.clearAllMocks());

describe('getPlacementsForCourse', () => {
  it('returns placements with rank coerced to a number', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        { id: 1, moduleId: 4, lessonId: 9, rank: '2.500', dependsOn: [] },
      ]),
    );

    const rows = await getPlacementsForCourse(3);

    expect(rows).toEqual([
      { id: 1, moduleId: 4, lessonId: 9, rank: 2.5, dependsOn: [] },
    ]);
  });

  it('returns an empty array for a course with no placements', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    expect(await getPlacementsForCourse(3)).toEqual([]);
  });
});

describe('getCourseIdsForLesson', () => {
  it('returns every course teaching the lesson, deduplicated', async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ courseId: 1 }, { courseId: 5 }, { courseId: 1 }]),
    );
    expect(await getCourseIdsForLesson(9)).toEqual([1, 5]);
  });

  it('returns an empty array for an unplaced lesson', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    expect(await getCourseIdsForLesson(9)).toEqual([]);
  });
});

describe('getCourseCountsForLessons', () => {
  it('maps each lesson id to how many distinct courses teach it', async () => {
    // `n` mocked as a pg numeric-count string (like `rank` above) so this
    // test can't pass if the implementation's `Number(r.n)` coercion is
    // dropped and a raw string leaks into the returned map.
    db.select.mockReturnValueOnce(
      makeChain([
        { lessonId: 9, n: '2' },
        { lessonId: 10, n: '1' },
      ]),
    );

    const counts = await getCourseCountsForLessons([9, 10]);

    expect(counts.get(9)).toBe(2);
    expect(counts.get(10)).toBe(1);
  });

  it('counts DISTINCT courses, so two modules of one course count once', async () => {
    // `db.select` is a bare vi.fn(); mockReturnValueOnce ignores whatever is
    // passed to .select(...), so the other tests in this file pass no matter
    // what projection the implementation builds. This test instead inspects
    // the actual argument .select() was called with, so it fails if
    // `countDistinct` regresses to a plain `count` — which would double-count
    // a lesson taught by two modules of the same course.
    db.select.mockReturnValueOnce(makeChain([{ lessonId: 9, n: '1' }]));

    await getCourseCountsForLessons([9]);

    const projection = db.select.mock.calls[0][0] as {
      n: { queryChunks: Array<{ value?: unknown[] }> };
    };
    // drizzle's countDistinct() opens its SQL with a `count(distinct ` string
    // chunk; plain count() opens with `count(` — no "distinct". This is the
    // only part of the built SQL that differs between the two functions.
    const opening = String(projection.n.queryChunks[0]?.value?.[0] ?? '');
    expect(opening).toMatch(/distinct/i);
  });

  it('short-circuits on an empty id list without querying', async () => {
    expect((await getCourseCountsForLessons([])).size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });
});
