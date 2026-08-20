// @vitest-environment node
import { integer, pgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real pgTable columns (not plain object stubs) so `eq()` in the module under
// test builds real query fragments against them — same "fully stub, never
// importOriginal" pattern as admin-course-cache-invalidation.test.ts and
// lesson-playback.test.ts.
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
});
const modulesTable = pgTable('modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
});
const coursesTable = pgTable('courses', {
  id: integer('id').primaryKey(),
});

/**
 * A chainable stub standing in for `db.select().from().innerJoin().innerJoin().where().limit()`.
 * Every builder method returns the same object so any subset/order of calls
 * keeps chaining, and `limit` resolves the awaited promise — matching the
 * real functions under test, which both terminate on `.limit(1)`.
 */
function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

const db = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ lessonsTable, modulesTable, coursesTable }));

const { getCourseIdForLessonId, getCourseIdForModuleId } = await import(
  '#/db/lesson-access'
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCourseIdForLessonId', () => {
  it('returns the course id a lesson belongs to', async () => {
    db.select.mockReturnValueOnce(makeChain([{ courseId: 42 }]));

    expect(await getCourseIdForLessonId(7)).toBe(42);
  });

  it('returns null for a lesson that does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([]));

    expect(await getCourseIdForLessonId(999)).toBeNull();
  });
});

describe('getCourseIdForModuleId', () => {
  it('returns the course id a module belongs to', async () => {
    db.select.mockReturnValueOnce(makeChain([{ courseId: 42 }]));

    expect(await getCourseIdForModuleId(3)).toBe(42);
  });

  it('returns null for a module that does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([]));

    expect(await getCourseIdForModuleId(999)).toBeNull();
  });
});
