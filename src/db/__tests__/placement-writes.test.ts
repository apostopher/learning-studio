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
// Task 6b: the placement table membership reads join, replacing the
// `modules.course_id` (ownership) hop. Real columns so `eq`/`countDistinct`
// build real fragments against `course_modules`.
const courseModulesTable = pgTable('course_modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  moduleId: integer('module_id'),
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
    limit: () => p,
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
// Final review, Important #3: plural — every course SHOWING the module (its
// owner and every remixer of the owner), not the owner alone.
const getCourseSlugsForModuleId = vi.hoisted(() =>
  vi.fn().mockResolvedValue(['a-course']),
);
const getCourseIdForModuleId = vi.hoisted(() => vi.fn().mockResolvedValue(3));
/**
 * The tenant boundary `linkLesson` consults before it writes. Defaulted to
 * "yes" so every test here keeps exercising the behaviour it was written for;
 * the two that own the boundary set it explicitly.
 */
const lessonBelongsToCourseOrg = vi.hoisted(() =>
  vi.fn().mockResolvedValue(true),
);

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({
  courseModulesTable,
  moduleLessonsTable,
  modulesTable,
}));
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache }));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugsForModuleId,
  getCourseIdForModuleId,
  lessonBelongsToCourseOrg,
}));
/**
 * The membership helper. `movePlacement` used to scope its UPDATE with it
 * (Task 6b); since the final review's Critical #1 it scopes by OWNERSHIP
 * instead, and the mock stays so a regression back to membership shows up
 * as a call to this (asserted absent) rather than as an import crash.
 */
const courseModuleIds = vi.hoisted(() =>
  vi.fn((courseId: number) => `SUBQUERY:${courseId}`),
);
vi.mock('#/db/course-modules', () => ({ courseModuleIds }));

const { linkLesson, unlinkLesson, movePlacement } = await import(
  '#/db/placements'
);

beforeEach(() => {
  vi.clearAllMocks();
  getCourseSlugsForModuleId.mockResolvedValue(['a-course']);
  getCourseIdForModuleId.mockResolvedValue(3);
  lessonBelongsToCourseOrg.mockResolvedValue(true);
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

  /**
   * The tenant boundary. `lessons.id` is a global serial, so a `lessonId` in a
   * request body is just an integer — and guarding the MODULE, which the route
   * does, establishes authority over the destination while saying nothing at
   * all about the lesson being dragged in.
   */
  it('refuses a lesson from another org, before writing anything', async () => {
    lessonBelongsToCourseOrg.mockResolvedValueOnce(false);

    const result = await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(result).toBe('foreign-lesson');
    // Nothing written, and nothing even looked up: a refusal that still did
    // the duplicate lookup would leak timing, and one that wrote first would
    // be no refusal at all. The insert assertion is the load-bearing one —
    // this is the exact hole the review found: place any lesson in the
    // database into a course you happen to hold `structure:create` on, and
    // playback then resolves its videoRef against YOUR credentials.
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();

    // Asked about the lesson and the TARGET COURSE — not the module id.
    // Mutant this catches: passing `input.moduleId` as the course, which
    // type-checks (both numbers) and compares the lesson's org against a
    // course id, so it would refuse almost everything while looking correct.
    expect(lessonBelongsToCourseOrg).toHaveBeenCalledWith(9, 3);
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

  it('invalidates every course showing the module so learners see the new lesson', async () => {
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
    getCourseSlugsForModuleId.mockResolvedValue(['a-course', 'remixer']);

    await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    // Not just that the cache got the right slugs (the stub answers the
    // same no matter what it's asked), but that the lookup was asked about
    // the right module in the first place — and that the REMIXER's slug
    // reached the cache, which the owner-only lookup never delivered.
    expect(getCourseSlugsForModuleId).toHaveBeenCalledWith(40);
    expect(
      invalidateCourseDetailsCache.mock.calls.map((call) => call[0]).sort(),
    ).toEqual(['a-course', 'remixer']);
  });
});

describe('unlinkLesson', () => {
  it('reports false when no placement matched', async () => {
    db.delete.mockReturnValue({
      where: () => ({ returning: vi.fn().mockResolvedValue([]) }),
    });
    expect(await unlinkLesson(40, 9)).toBe(false);
  });

  it('scopes the DELETE to this module AND this lesson, and invalidates every course showing the module', async () => {
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
    getCourseSlugsForModuleId.mockResolvedValue(['a-course', 'remixer']);

    expect(await unlinkLesson(40, 9)).toBe(true);

    expect(db.delete).toHaveBeenCalledWith(moduleLessonsTable);
    const condition = where.mock.calls[0][0];
    expect(renderSql(condition)).toBe(
      '("module_lessons"."module_id" = $1 and "module_lessons"."lesson_id" = $2)',
    );
    expect(renderSqlParams(condition)).toEqual([40, 9]);

    expect(getCourseSlugsForModuleId).toHaveBeenCalledWith(40);
    expect(
      invalidateCourseDetailsCache.mock.calls.map((call) => call[0]).sort(),
    ).toEqual(['a-course', 'remixer']);
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

    const result = await movePlacement({
      lessonId: 9,
      fromModuleId: 40,
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

  /**
   * Final review, Critical #1 + #2. The UPDATE's WHERE pins THREE things:
   *
   * - `module_id = fromModuleId` — exactly ONE placement row. Keyed on the
   *   lesson alone (the previous shape), a lesson a course holds twice — in
   *   its own module AND in one it borrowed — matched both rows, and the
   *   unique (module_id, lesson_id) index turned the drag into a 500.
   * - `lesson_id = lessonId`.
   * - `module_id in (modules OWNED by the target's owner)` — the placement
   *   being moved must sit in a module the target's owner also owns. The
   *   previous scope was MEMBERSHIP (`courseModuleIds(targetCourse)`), which
   *   after a remix includes the source's modules: a remixer's manager could
   *   name their own module as the target and pull a lesson OUT of a
   *   borrowed module, changing the owner's course everywhere it is shown.
   *   Under the owned scope that row is unreachable and the write returns
   *   null (the route 404s); the route's own guard on the source's owner
   *   turns it into a 403 first.
   *
   * Rendered as exact SQL text with the bound params, so a mutant that keeps
   * the membership subquery (renders `in $3` with a `SUBQUERY:` sentinel,
   * not the owner select), drops the `from` pin, or binds the target's id
   * where the owner's course id belongs, all go red.
   */
  it('pins the UPDATE to the source placement, and to modules OWNED by the target’s owner', async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 41, lessonId: 9, rank: '1.5', dependsOn: [] },
      ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update.mockReturnValue({ set });

    await movePlacement({
      lessonId: 9,
      fromModuleId: 40,
      targetModuleId: 41,
      prevLessonId: null,
      nextLessonId: null,
    });

    // The owner is resolved from the TARGET module, not the source one.
    expect(getCourseIdForModuleId).toHaveBeenCalledWith(41);
    expect(getCourseIdForModuleId).not.toHaveBeenCalledWith(40);
    // Ownership, not membership: the membership helper is the wrong
    // question here and must not be consulted at all.
    expect(courseModuleIds).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();

    expect(where).toHaveBeenCalledTimes(1);
    const condition = where.mock.calls[0][0];
    expect(renderSql(condition)).toBe(
      '("module_lessons"."module_id" = $1 and "module_lessons"."lesson_id" = $2 and "module_lessons"."module_id" in (select "modules"."id" from "modules" where "modules"."course_id" = $3))',
    );
    expect(renderSqlParams(condition)).toEqual([40, 9, 3]);
  });

  it('returns null, writing nothing else, when the UPDATE matched no row (placement in a borrowed module)', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update.mockReturnValue({ set });

    const result = await movePlacement({
      lessonId: 9,
      fromModuleId: 40,
      targetModuleId: 41,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(result).toBeNull();
    expect(invalidateCourseDetailsCache).not.toHaveBeenCalled();
  });

  it('invalidates every course showing the target module so learners see the move', async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 41, lessonId: 9, rank: '1.5', dependsOn: [] },
      ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update.mockReturnValue({ set });
    getCourseSlugsForModuleId.mockResolvedValue(['a-course', 'remixer']);

    await movePlacement({
      lessonId: 9,
      fromModuleId: 40,
      targetModuleId: 41,
      prevLessonId: null,
      nextLessonId: null,
    });

    // Precision: the slug lookup must be for the TARGET module (41), not
    // some other one the stub would happily answer for anyway.
    expect(getCourseSlugsForModuleId).toHaveBeenCalledWith(41);
    expect(
      invalidateCourseDetailsCache.mock.calls.map((call) => call[0]).sort(),
    ).toEqual(['a-course', 'remixer']);
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
