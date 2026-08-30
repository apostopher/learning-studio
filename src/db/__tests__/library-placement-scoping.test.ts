// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import {
  integer,
  jsonb,
  numeric,
  PgDialect,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Task 5b moves the STUDENT-facing library scoping (`#/db/library.ts`) onto
// placements: a lesson's course is now reached through `module_lessons`
// instead of the legacy single-valued `lessons.module_id`. Real `pgTable`
// stubs, `#/db` and `#/db/schema` fully mocked — never `importOriginal` (see
// memory: vitest can't resolve @/, use #/).
const coursesTable = pgTable('courses', {
  id: integer('id').primaryKey(),
  slug: text('slug'),
});
const modulesTable = pgTable('modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
  slug: text('slug'),
});
const lessonsTable = pgTable('lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  slug: text('slug'),
});
const moduleLessonsTable = pgTable('module_lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  lessonId: integer('lesson_id'),
  rank: numeric('rank'),
  dependsOn: jsonb('depends_on'),
});
const blobFilesTable = pgTable('blob_files', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  url: varchar('url', { length: 500 }),
  size: integer('size'),
  type: varchar('type', { length: 100 }),
});
const blobFileAssignmentsTable = pgTable('blob_file_assignments', {
  id: integer('id').primaryKey(),
  fileId: integer('file_id'),
  courseId: integer('course_id'),
  moduleId: integer('module_id'),
  lessonId: integer('lesson_id'),
});

/**
 * Chainable stub for a single drizzle query, ignoring its arguments — house
 * pattern from `placements.test.ts`. Fine for driving control flow and
 * checking what the CALLER receives back, but it cannot catch a wrong join or
 * a wrong WHERE target, since every builder method returns the same object no
 * matter what it was called with.
 */
function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring real drizzle query builders
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

type JoinCalls = {
  innerJoin: Array<[table: unknown, condition: SQL]>;
  leftJoin: Array<[table: unknown, condition: SQL]>;
  where: SQL[];
};

/**
 * Variant of `makeChain` that records every `(table, condition)` pair passed
 * to `.innerJoin()`/`.leftJoin()`, in call order, and every condition passed
 * to `.where()`. Plain `makeChain` discards its arguments entirely, so a
 * mutant that never touched the join at all would satisfy every assertion
 * built on it. Modelled on `makeJoinCapturingChain` in
 * `lesson-course-resolution.test.ts`.
 */
function makeCapturingChain(result: unknown, calls: JoinCalls) {
  const chain = {
    from: () => chain,
    innerJoin: (table: unknown, condition: SQL) => {
      calls.innerJoin.push([table, condition]);
      return chain;
    },
    leftJoin: (table: unknown, condition: SQL) => {
      calls.leftJoin.push([table, condition]);
      return chain;
    },
    where: (condition: SQL) => {
      calls.where.push(condition);
      return chain;
    },
    // biome-ignore lint/suspicious/noThenProperty: see makeChain above
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const dialect = new PgDialect();

/**
 * Render a captured drizzle condition to its exact parameterized SQL text —
 * no database needed. Fix round 1 replaced a hand-rolled tree-walk
 * (`collectColumnChunks`, keeping columns by `.table` reference) with this:
 * the walk could prove a column belonged to the right TABLE, but flattened
 * every join's condition into one bag before asserting, so it could not tell
 * "module_lessons.module_id and lesson_module.id both appear somewhere" apart
 * from "module_lessons.module_id is correctly PAIRED with lesson_module.id on
 * THIS join" — the actual content of the rewrite. Exact SQL text pins the
 * pairing, the boolean shape (`and` vs `or`, `is null` vs `is not null`), and
 * incidentally the join order (a reordered join renders a different string at
 * the position under test). Verified against this repo's installed
 * `drizzle-orm` (`^0.45.1`) — see fix-round-1 report for the probe output.
 */
function render(condition: SQL): string {
  return dialect.sqlToQuery(condition).sql;
}

const db = vi.hoisted(() => ({ select: vi.fn(), selectDistinct: vi.fn() }));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({
  coursesTable,
  modulesTable,
  lessonsTable,
  moduleLessonsTable,
  blobFilesTable,
  blobFileAssignmentsTable,
}));

const { getLibraryForCourse, getCourseSlugsForLibraryFile } = await import(
  '#/db/library'
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getLibraryForCourse', () => {
  // Fix round 1, Critical 2: the original two tests here flattened every
  // leftJoin condition into one bag before asserting, so they could not tell
  // "both tables appear somewhere" from "module_lessons.module_id is actually
  // paired with lesson_module.id ON THIS JOIN" — `eq(lessonModule.courseId,
  // moduleLessonsTable.moduleId)` (wrong column on the alias side) satisfied
  // them. They also used `.find`/`.some`, so reordering the two joins (which
  // produces invalid SQL at runtime — module_lessons.module_id referenced
  // before module_lessons is in scope) passed too. This single test asserts
  // per-join, in order: `module_lessons` must appear, its own condition must
  // render exactly `module_lessons.lesson_id = lessons.id`, and the VERY NEXT
  // leftJoin must render exactly `lesson_module.id = module_lessons.module_id`.
  it('joins module_lessons then the aliased placed module, in that order, with lesson_id and module_id correctly paired', async () => {
    const calls: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getLibraryForCourse(3);

    const joinedTables = calls.leftJoin.map(([table]) => table);
    const moduleLessonsIndex = joinedTables.indexOf(moduleLessonsTable);
    expect(moduleLessonsIndex).toBeGreaterThanOrEqual(0);
    expect(render(calls.leftJoin[moduleLessonsIndex][1])).toBe(
      '"module_lessons"."lesson_id" = "lessons"."id"',
    );

    const nextJoin = calls.leftJoin[moduleLessonsIndex + 1];
    expect(nextJoin).toBeDefined();
    expect(render(nextJoin[1])).toBe(
      '"lesson_module"."id" = "module_lessons"."module_id"',
    );
  });

  // Mutant this catches: swapping either `.leftJoin(lessonsTable, ...)` or
  // `.leftJoin(moduleLessonsTable, ...)` for `.innerJoin(...)` — a change
  // that "looks" like a harmless tidy-up but silently drops every one of the
  // 11 module-only assignment rows (no lesson at all), since an inner join
  // eliminates any row with no match on the right-hand table.
  it('left-joins lessons and module_lessons, so module-only assignments (no lesson) still surface', async () => {
    const calls: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getLibraryForCourse(3);

    expect(calls.leftJoin.some(([table]) => table === lessonsTable)).toBe(true);
    expect(calls.leftJoin.some(([table]) => table === moduleLessonsTable)).toBe(
      true,
    );
    expect(calls.innerJoin.some(([table]) => table === lessonsTable)).toBe(
      false,
    );
    expect(
      calls.innerJoin.some(([table]) => table === moduleLessonsTable),
    ).toBe(false);
  });

  // Fix round 1, Critical 1: the original version of this test counted
  // `course_id`/`id` column chunks and checked which TABLE each belonged to,
  // but never checked the boolean OPERATORS connecting them — so it could not
  // fail for the rule it claimed to guard. Three mutants slipped through it:
  // scoping the lesson branch by the raw assignment's own stored course
  // (`blob_file_assignments.course_id`, null on every imported row — this
  // would make every lesson-scoped file vanish from every course), swapping
  // the fallback's `and` for `or` (the actual D8 bug: re-admits the three
  // mismatched rows under the wrong course), and flipping `is null` to
  // `is not null` (drops all 11 module-only rows). Exact SQL text catches all
  // three because each changes the rendered string, not just which table a
  // chunk points at.
  it("keeps the lesson's placement winning over the assignment's stored module", async () => {
    const calls: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getLibraryForCourse(7);

    expect(calls.where).toHaveLength(1);
    expect(render(calls.where[0])).toBe(
      '("blob_files"."url" like $1 and ("lesson_module"."course_id" = $2 or ("lessons"."id" is null and "modules"."course_id" = $3)))',
    );
  });

  // Not itself a proof of the join rewrite (a courseId-parameterization bug
  // is a defect this refactor could not introduce — the parameter has always
  // been threaded straight from the function argument into the WHERE). Kept
  // as a narrow, independent safety net: the placements migration's whole
  // point is that the SAME query shape must answer correctly for whichever
  // course is asked, so this pins that the bound parameter is actually the
  // caller's own courseId and not some closed-over or hardcoded value.
  it('parameterizes the placement scope by whichever course is actually queried', async () => {
    const callsA: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    const callsB: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.select
      .mockReturnValueOnce(makeCapturingChain([], callsA))
      .mockReturnValueOnce(makeCapturingChain([], callsB));

    await getLibraryForCourse(101);
    await getLibraryForCourse(202);

    expect(dialect.sqlToQuery(callsA.where[0]).params).toEqual([
      '%/library-%',
      101,
      101,
    ]);
    expect(dialect.sqlToQuery(callsB.where[0]).params).toEqual([
      '%/library-%',
      202,
      202,
    ]);
  });
});

describe('getCourseSlugsForLibraryFile', () => {
  // Mirrors the getLibraryForCourse join-pairing test above — same mutants,
  // same reasoning, different function. `#/db/library.ts` builds this query
  // with its own separate alias chain, so the rewrite has to be verified here
  // independently; fixing one function's join is not evidence the other one
  // was touched.
  it('joins module_lessons then the aliased placed module, in that order, with lesson_id and module_id correctly paired', async () => {
    const calls: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.selectDistinct.mockReturnValueOnce(makeCapturingChain([], calls));

    await getCourseSlugsForLibraryFile(9);

    const joinedTables = calls.leftJoin.map(([table]) => table);
    const moduleLessonsIndex = joinedTables.indexOf(moduleLessonsTable);
    expect(moduleLessonsIndex).toBeGreaterThanOrEqual(0);
    expect(render(calls.leftJoin[moduleLessonsIndex][1])).toBe(
      '"module_lessons"."lesson_id" = "lessons"."id"',
    );

    const nextJoin = calls.leftJoin[moduleLessonsIndex + 1];
    expect(nextJoin).toBeDefined();
    expect(render(nextJoin[1])).toBe(
      '"lesson_module"."id" = "module_lessons"."module_id"',
    );
  });

  // Mutant this catches: joining lessonsTable with `.innerJoin` instead of
  // `.leftJoin` — a file assigned only at the module level (no lesson) would
  // vanish from the result set entirely instead of resolving via viaModule.
  it('left-joins lessons, so a module-only assignment still resolves a course slug', async () => {
    const calls: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.selectDistinct.mockReturnValueOnce(makeCapturingChain([], calls));

    await getCourseSlugsForLibraryFile(9);

    expect(calls.leftJoin.some(([table]) => table === lessonsTable)).toBe(true);
    expect(calls.innerJoin.some(([table]) => table === lessonsTable)).toBe(
      false,
    );
  });

  // Fix round 1, Minor 5: this and the two tests below exercise the `??`
  // fallback and the `Set` dedup loop in `getCourseSlugsForLibraryFile`'s JS
  // body — code this task did NOT change (only the join above changed) and
  // that would have passed against the pre-Task-5b implementation too, given
  // the same canned rows. Kept as honest characterization tests of that
  // logic, not as evidence the SQL rewrite works — that evidence is the join
  // test above. The 11 module-only rows: no lesson at all, so `viaLesson` is
  // null and `viaModule` must carry the slug through.
  it('resolves a module-only assignment (no lesson) via its module', async () => {
    db.selectDistinct.mockReturnValueOnce(
      makeChain([{ viaModule: 'safety-briefings', viaLesson: null }]),
    );

    expect(await getCourseSlugsForLibraryFile(9)).toEqual(['safety-briefings']);
  });

  // Characterization test, not a join-rewrite proof — see the comment on the
  // test above. Documents that `row.viaLesson ?? row.viaModule` (unchanged by
  // this task) is what makes the D8 rule hold once rows reach the JS layer.
  it("prefers the lesson's course over the stored module's when a row resolves both", async () => {
    db.selectDistinct.mockReturnValueOnce(
      makeChain([{ viaModule: 'wrong-course', viaLesson: 'right-course' }]),
    );

    expect(await getCourseSlugsForLibraryFile(9)).toEqual(['right-course']);
  });

  // Characterization test, not a join-rewrite proof — see the comment two
  // tests up. Documents that the pre-existing `Set`-based accumulation
  // (unchanged by this task) is what lets the NEW row shape the placements
  // join can now produce (one row per teaching course for the same lesson)
  // come out as every distinct slug rather than just the first.
  it('returns every course teaching the lesson, deduplicated', async () => {
    db.selectDistinct.mockReturnValueOnce(
      makeChain([
        { viaModule: null, viaLesson: 'flight-basics' },
        { viaModule: null, viaLesson: 'aerobatics' },
        { viaModule: null, viaLesson: 'flight-basics' },
      ]),
    );

    const slugs = await getCourseSlugsForLibraryFile(9);

    expect(slugs).toHaveLength(2);
    expect(slugs).toEqual(
      expect.arrayContaining(['flight-basics', 'aerobatics']),
    );
  });
});
