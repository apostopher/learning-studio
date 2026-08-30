// @vitest-environment node
import { integer, jsonb, numeric, pgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import { collectSqlTokens } from '#/db/__tests__/sql-tokens';

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
  it('returns null when the target module does not exist', async () => {
    // Distinguished from 'duplicate': Task 9 maps this to a 404 ("no such
    // module"), 'duplicate' to a 409 ("already in this course"). Collapsing
    // them would report 409 for a dangling module id, which is false.
    getCourseIdForModuleId.mockResolvedValueOnce(null);

    const result = await linkLesson({
      moduleId: 999,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(result).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

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

  it('inserts a placement carrying the right module, lesson and rank', async () => {
    db.select.mockReturnValueOnce(makeChain([{ courseId: 7 }]));
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 40, lessonId: 9, rank: '1', dependsOn: [] },
      ]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert.mockReturnValue({ values });

    const result = await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    // Consumer-side proof, not just the (stubbed) return value: the INSERT
    // must actually have been built with this module, this lesson, an empty
    // dependsOn, and — since both neighbours are null — the "empty module"
    // rank of 1.
    expect(db.insert).toHaveBeenCalledWith(moduleLessonsTable);
    const inserted = values.mock.calls[0][0] as {
      moduleId: number;
      lessonId: number;
      dependsOn: unknown[];
      rank: unknown;
    };
    expect(inserted.moduleId).toBe(40);
    expect(inserted.lessonId).toBe(9);
    expect(inserted.dependsOn).toEqual([]);
    expect(collectSqlTokens(inserted.rank)).toEqual(['1']);

    expect(result).toEqual({
      id: 1,
      moduleId: 40,
      lessonId: 9,
      rank: 1,
      dependsOn: [],
    });
  });

  it('computes a halved rank when only a following lesson is given (insert-first)', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 40, lessonId: 9, rank: '2', dependsOn: [] },
      ]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert.mockReturnValue({ values });

    await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: 4,
    });

    const tokens = collectSqlTokens(
      (values.mock.calls[0][0] as { rank: unknown }).rank,
    );
    expect(tokens).toContain('4'); // the next lesson's id, looked up by rank
    expect(tokens).toContain(' / 2');
    expect(tokens).not.toContain(' + 1');
  });

  it('computes rank +1 when only a preceding lesson is given (insert-last)', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 40, lessonId: 9, rank: '4', dependsOn: [] },
      ]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert.mockReturnValue({ values });

    await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: 3,
      nextLessonId: null,
    });

    const tokens = collectSqlTokens(
      (values.mock.calls[0][0] as { rank: unknown }).rank,
    );
    expect(tokens).toContain('3'); // the previous lesson's id
    expect(tokens).toContain(' + 1');
    expect(tokens).not.toContain(' / 2');
  });

  it('computes a midpoint rank when placed between two lessons', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 40, lessonId: 9, rank: '3.5', dependsOn: [] },
      ]);
    const values = vi.fn().mockReturnValue({ returning });
    db.insert.mockReturnValue({ values });

    await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: 3,
      nextLessonId: 4,
    });

    const tokens = collectSqlTokens(
      (values.mock.calls[0][0] as { rank: unknown }).rank,
    );
    expect(tokens).toContain('3');
    expect(tokens).toContain('4');
    expect(tokens).toContain(') / 2');
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

    // Not just that the cache got the right slug (the stub returns
    // 'a-course' no matter what it's asked), but that the lookup was asked
    // about the right module in the first place.
    expect(getCourseSlugForModuleId).toHaveBeenCalledWith(40);
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

  it('scopes the DELETE to this module AND this lesson, and invalidates the right course cache', async () => {
    // The destructive write: a bare eq(lessonId) WHERE (same defect class as
    // the movePlacement bug) would delete this lesson's placement out of
    // every course teaching it, not just module 40's. Capturing what
    // `.where()` was actually called with (not a stub that discards it)
    // proves the DELETE is scoped to both moduleId and lessonId.
    //
    // Task 5e, Part 2b: this used to check `collectSqlTokens` for presence of
    // 'module_id'/'40'/'lesson_id'/'9' — which cannot tell a correctly paired
    // `and(eq(moduleId, 40), eq(lessonId, 9))` apart from a SWAPPED
    // `and(eq(moduleId, 9), eq(lessonId, 40))`: both produce the exact same
    // four tokens, just paired with the wrong column. Exact SQL text pins the
    // pairing. Verified RED against that swap mutant (renders
    // `("module_lessons"."module_id" = $1 and "module_lessons"."lesson_id" =
    // $2)` with params `[9, 40]` instead of `[40, 9]`).
    const where = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });
    db.delete.mockReturnValue({ where });

    expect(await unlinkLesson(40, 9)).toBe(true);

    expect(db.delete).toHaveBeenCalledWith(moduleLessonsTable);
    const condition = where.mock.calls[0][0];
    expect(renderSql(condition)).toBe(
      '("module_lessons"."module_id" = $1 and "module_lessons"."lesson_id" = $2)',
    );
    expect(renderSqlParams(condition)).toEqual([40, 9]);

    expect(getCourseSlugForModuleId).toHaveBeenCalledWith(40);
    expect(invalidateCourseDetailsCache).toHaveBeenCalledWith('a-course');
  });
});

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
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 41, lessonId: 9, rank: '1.5', dependsOn: [] },
      ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update.mockReturnValue({ set });

    // The module-id-for-course lookup itself, captured (not discarded) so
    // this test can prove it was scoped to course 3 — the target module's
    // OWN course — rather than merely asserting on a stub-controlled result
    // that no implementation could contradict.
    const moduleLookupWhere = vi
      .fn()
      .mockReturnValue(makeChain([{ id: 40 }, { id: 41 }]));
    const moduleLookupFrom = vi
      .fn()
      .mockReturnValue({ where: moduleLookupWhere });
    db.select.mockReturnValueOnce({ from: moduleLookupFrom });

    await movePlacement({
      lessonId: 9,
      targetModuleId: 41,
      prevLessonId: null,
      nextLessonId: null,
    });

    // getCourseIdForModuleId was asked about the TARGET module, not some
    // other one.
    expect(getCourseIdForModuleId).toHaveBeenCalledWith(41);
    // The module-id lookup that feeds the UPDATE's allowlist was itself
    // scoped to course 3 (getCourseIdForModuleId's resolved course for
    // module 41) — this is the mechanism that keeps module 90 (course 7)
    // out of the allowlist, not an assertion that merely repeats a value no
    // stub ever produced.
    //
    // Task 5e, Part 2b: exact SQL text, not `collectSqlTokens`, which cannot
    // tell "scoped by course_id" apart from a mutant that scoped by a
    // different integer column entirely as long as the value 3 still
    // appears somewhere in the tree.
    expect(renderSql(moduleLookupWhere.mock.calls[0][0])).toBe(
      '"modules"."course_id" = $1',
    );
    expect(renderSqlParams(moduleLookupWhere.mock.calls[0][0])).toEqual([3]);

    expect(where).toHaveBeenCalledTimes(1);
    const condition = where.mock.calls[0][0];
    // Task 5e, Part 2b: this used to check `collectSqlTokens` for presence
    // of 'module_id'/'40'/'41' — which cannot tell "scoped by
    // module_lessons.lesson_id AND module_lessons.module_id in (40, 41)"
    // apart from a mutant that SWAPPED which column carries the lessonId vs
    // the moduleId allowlist (e.g. `eq(moduleId, 9)` +
    // `inArray(lessonId, [40, 41])`): both produce the exact same token set
    // ('module_id', 'lesson_id', '9', '40', '41'), just paired with the
    // wrong column. Exact SQL text pins the pairing. Verified RED against
    // that swap mutant (renders `("module_lessons"."module_id" = $1 and
    // "module_lessons"."lesson_id" in ($2, $3))` with params `[9, 40, 41]`
    // instead of the column names swapped back).
    expect(renderSql(condition)).toBe(
      '("module_lessons"."lesson_id" = $1 and "module_lessons"."module_id" in ($2, $3))',
    );
    expect(renderSqlParams(condition)).toEqual([9, 40, 41]);
  });

  it('invalidates the target course cache so learners see the move', async () => {
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

    // Precision: the slug lookup must be for the TARGET module (41), not
    // some other one the stub would happily answer for anyway.
    expect(getCourseSlugForModuleId).toHaveBeenCalledWith(41);
    expect(invalidateCourseDetailsCache).toHaveBeenCalledWith('a-course');
  });

  // The optional caller-supplied `tx` parameter this test used to cover
  // (Task 5a fix round 2) went dead the moment Task 7 removed `moveLesson`'s
  // transaction — `movePlacement` now always runs against the module-level
  // `db`, so the parameter (and this test) were deleted rather than
  // converted. Equivalent coverage lives in
  // `admin-course-cache-invalidation.test.ts`'s "moveLesson performs exactly
  // one write path" test, which asserts `movePlacement` is called with a
  // single plain argument.
});
