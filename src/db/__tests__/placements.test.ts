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
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve(result),
    orderBy: () => Promise.resolve(result),
    // biome-ignore lint/suspicious/noThenProperty: makes the stub thenable so a bare `await db.select()...where(...)` resolves (getCourseIdsForLesson terminates on `.where()`).
    then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r),
  };
  return chain;
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
    db.select.mockReturnValueOnce(
      makeChain([
        { lessonId: 9, n: 2 },
        { lessonId: 10, n: 1 },
      ]),
    );

    const counts = await getCourseCountsForLessons([9, 10]);

    expect(counts.get(9)).toBe(2);
    expect(counts.get(10)).toBe(1);
  });

  it('short-circuits on an empty id list without querying', async () => {
    expect((await getCourseCountsForLessons([])).size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });
});
