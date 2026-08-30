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

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const invalidateCourseDetailsCache = vi.hoisted(() => vi.fn());
const getCourseSlugForModuleId = vi.hoisted(() =>
  vi.fn().mockResolvedValue('a-course'),
);
const getCourseIdForModuleId = vi.hoisted(() => vi.fn().mockResolvedValue(3));

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ moduleLessonsTable, modulesTable }));
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache }));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForModuleId,
  getCourseIdForModuleId,
}));

const { linkLesson, unlinkLesson, movePlacement } = await import(
  '#/db/placements'
);

beforeEach(() => {
  vi.clearAllMocks();
  getCourseSlugForModuleId.mockResolvedValue('a-course');
  getCourseIdForModuleId.mockResolvedValue(3);
});

describe('linkLesson', () => {
  it('refuses a second placement in a course that already teaches the lesson', async () => {
    // The lesson is already in course 3; the target module is also course 3.
    db.select.mockReturnValueOnce(makeChain([{ courseId: 3 }]));

    const result = await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(result).toBe('duplicate');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('inserts a placement when the course does not yet teach the lesson', async () => {
    db.select.mockReturnValueOnce(makeChain([{ courseId: 7 }]));
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 40, lessonId: 9, rank: '1', dependsOn: [] },
      ]);
    db.insert.mockReturnValue({ values: () => ({ returning }) });

    const result = await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(result).toEqual({
      id: 1,
      moduleId: 40,
      lessonId: 9,
      rank: 1,
      dependsOn: [],
    });
  });

  it('invalidates the target course cache so learners see the new lesson', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    db.insert.mockReturnValue({
      values: () => ({
        returning: vi
          .fn()
          .mockResolvedValue([
            { id: 1, moduleId: 40, lessonId: 9, rank: '1', dependsOn: [] },
          ]),
      }),
    });

    await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(invalidateCourseDetailsCache).toHaveBeenCalledWith('a-course');
  });
});

describe('unlinkLesson', () => {
  it('reports false when no placement matched', async () => {
    db.delete.mockReturnValue({
      where: () => ({ returning: vi.fn().mockResolvedValue([]) }),
    });
    expect(await unlinkLesson(40, 9)).toBe(false);
  });

  it('reports true and invalidates the course cache when one was removed', async () => {
    db.delete.mockReturnValue({
      where: () => ({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) }),
    });

    expect(await unlinkLesson(40, 9)).toBe(true);
    expect(invalidateCourseDetailsCache).toHaveBeenCalledWith('a-course');
  });
});

/**
 * Recursively collect every column name and literal parameter value out of a
 * drizzle `SQL` condition tree (as built by `eq`/`and`/`inArray`/etc). Real
 * drizzle objects, not stubs, are what `movePlacement` builds and passes to
 * `.where()` — walking them is how the cross-course test below proves what
 * columns and values the compiled WHERE clause actually references, rather
 * than trusting the implementation's own description of itself.
 */
function collectSqlTokens(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const child of node) collectSqlTokens(child, out);
    return out;
  }
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.name === 'string') out.push(record.name);
    if ('value' in record) out.push(String(record.value));
    if ('queryChunks' in record) collectSqlTokens(record.queryChunks, out);
  }
  return out;
}

describe('movePlacement', () => {
  it('updates the placement rather than the lesson', async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 41, lessonId: 9, rank: '1.5', dependsOn: [] },
      ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update.mockReturnValue({ set });
    // getCourseIdForModuleId(41) resolves to course 3 (default mock); this
    // is the lookup of course 3's module ids that scopes the UPDATE.
    db.select.mockReturnValueOnce(makeChain([{ id: 40 }, { id: 41 }]));

    const result = await movePlacement({
      lessonId: 9,
      targetModuleId: 41,
      prevLessonId: 3,
      nextLessonId: 4,
    });

    // The consumer is the UPDATE: it must target module_lessons, and must
    // carry the new module id.
    expect(db.update).toHaveBeenCalledWith(moduleLessonsTable);
    expect(set.mock.calls[0][0]).toMatchObject({ moduleId: 41 });
    expect(result).toMatchObject({ moduleId: 41, rank: 1.5 });
  });

  it('cannot touch a placement of the same lesson in a different course', async () => {
    // Lesson 9 is placed in both course 3 (modules 40 and 41) and course 7
    // (module 90). Moving it within course 3 (target module 41, also
    // course 3) must scope the UPDATE's WHERE to course 3's modules only —
    // a bare `eq(lessonId, 9)` WHERE (the brief's original code) would also
    // match the course-7 placement in module 90 and silently corrupt it.
    //
    // getCourseIdForModuleId(41) resolves to 3 via the default mock. The
    // next db.select call is the lookup of course 3's own module ids,
    // which this test controls: it returns only [40, 41] — module 90 is
    // never even fetched, because it belongs to a different course.
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 41, lessonId: 9, rank: '1.5', dependsOn: [] },
      ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update.mockReturnValue({ set });
    db.select.mockReturnValueOnce(makeChain([{ id: 40 }, { id: 41 }]));

    await movePlacement({
      lessonId: 9,
      targetModuleId: 41,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(where).toHaveBeenCalledTimes(1);
    const tokens = collectSqlTokens(where.mock.calls[0][0]);

    // The WHERE clause must reference module_id (proving it is scoped
    // beyond a bare lessonId match) and must only ever mention the ids
    // that were actually looked up for course 3 — never module 90, which
    // belongs to course 7 and was never queried for.
    expect(tokens).toContain('module_id');
    expect(tokens).toContain('40');
    expect(tokens).toContain('41');
    expect(tokens).not.toContain('90');
  });
});
