// @vitest-environment node
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectSqlTokens } from '#/db/__tests__/sql-tokens';

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
 * checking what the CALLER receives back, but (per the dispatch's warning,
 * confirmed against `lesson-course-resolution.test.ts`'s own doc comment) it
 * cannot catch a wrong join or a wrong WHERE target, since every builder
 * method returns the same object no matter what it was called with.
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
  innerJoin: Array<[table: unknown, condition: unknown]>;
  leftJoin: Array<[table: unknown, condition: unknown]>;
  where: unknown[];
};

/**
 * Variant of `makeChain` that records every `(table, condition)` pair passed
 * to `.innerJoin()`/`.leftJoin()`, and every condition passed to `.where()`.
 * This is what actually proves the join rewrite happened: `makeChain` above
 * discards its arguments entirely, so a mutant that never touched the join at
 * all — still hopping `lessons.module_id` straight to the module — would
 * satisfy every assertion built on plain `makeChain`. Modelled on
 * `makeJoinCapturingChain` in `lesson-course-resolution.test.ts`.
 */
function makeCapturingChain(result: unknown, calls: JoinCalls) {
  const chain = {
    from: () => chain,
    innerJoin: (table: unknown, condition: unknown) => {
      calls.innerJoin.push([table, condition]);
      return chain;
    },
    leftJoin: (table: unknown, condition: unknown) => {
      calls.leftJoin.push([table, condition]);
      return chain;
    },
    where: (condition: unknown) => {
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

type ColumnChunk = { name: string; table: unknown };

/**
 * Recursively collect every real drizzle Column reference (an object exposing
 * both `.name` — the db column name — and `.table` — the table it actually
 * belongs to) out of a condition tree. `collectSqlTokens` (shared, used
 * elsewhere in this file) only gives back name/value STRINGS, which can't
 * tell `lessons.module_id` apart from `module_lessons.module_id` — both are
 * named `module_id`. Keeping `.table` by reference is what lets a test prove
 * WHICH table a condition actually reads from, which is the entire content of
 * the Task 5b join rewrite: `lessonModule` (the aliased `modules` row a
 * lesson lives in) used to be reached via `lessons.module_id` and is now
 * reached via `module_lessons.module_id`. Both shapes produce identical
 * `collectSqlTokens` output (`['module_id']`), so only this reference-based
 * check can tell them apart.
 */
function collectColumnChunks(
  node: unknown,
  out: ColumnChunk[] = [],
): ColumnChunk[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const child of node) collectColumnChunks(child, out);
    return out;
  }
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.name === 'string' && 'table' in record) {
      out.push({ name: record.name, table: record.table });
    }
    if ('queryChunks' in record) {
      collectColumnChunks(record.queryChunks, out);
    }
  }
  return out;
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
  // Mutant this catches: reverting to the pre-Task-5b join —
  // `.leftJoin(lessonModule, eq(lessonsTable.moduleId, lessonModule.id))` —
  // which never touches `module_lessons` at all. `makeChain`-based tests
  // can't see this (they ignore join arguments entirely); this test captures
  // the real `(table, condition)` pairs.
  it('joins module_lessons on lesson_id to reach a placed lesson, not the legacy lessons.module_id path', async () => {
    const calls: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getLibraryForCourse(3);

    const moduleLessonsJoin = calls.leftJoin.find(
      ([table]) => table === moduleLessonsTable,
    );
    expect(moduleLessonsJoin).toBeDefined();
    const tokens = collectSqlTokens(moduleLessonsJoin?.[1]);
    expect(tokens).toContain('lesson_id');
  });

  // Mutant this catches: a "half revert" that keeps a join to
  // `module_lessons` in the chain (so the test above still passes) but wires
  // the lesson's module back from `lessons.module_id` instead of
  // `module_lessons.module_id` — e.g. leaving
  // `eq(lessonsTable.moduleId, lessonModule.id)` in place. Both shapes are
  // named `module_id`, so only checking the owning TABLE by reference (not
  // the column name) can tell them apart.
  it('sources the placed module from module_lessons.module_id, never from lessons.module_id', async () => {
    const calls: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getLibraryForCourse(3);

    const chunks = collectColumnChunks(calls.leftJoin.map(([, c]) => c));
    const legacyModuleId = chunks.find(
      (c) => c.name === 'module_id' && c.table === lessonsTable,
    );
    const placementModuleId = chunks.find(
      (c) => c.name === 'module_id' && c.table === moduleLessonsTable,
    );
    expect(legacyModuleId).toBeUndefined();
    expect(placementModuleId).toBeDefined();
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

  // Mutant this catches: "simplifying" the WHERE while doing the join
  // rewrite so the first OR branch scopes by the assignment's own STORED
  // module (`eq(modulesTable.courseId, courseId)`) instead of the lesson's
  // PLACED module (`eq(lessonModule.courseId, courseId)`) — which is exactly
  // the D8 bug the doc comment warns about: three rows name a module their
  // lesson doesn't live in, and this would file them under the wrong course.
  // Both branches project a column literally named `course_id`, so — same as
  // the test above — only checking the owning table by reference (not the
  // name) can tell "the lesson's placement" apart from "the stored module".
  it("keeps the lesson's placement winning over the assignment's stored module", async () => {
    const calls: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.select.mockReturnValueOnce(makeCapturingChain([], calls));

    await getLibraryForCourse(7);

    expect(calls.where).toHaveLength(1);
    const chunks = collectColumnChunks(calls.where[0]);
    const courseIdChunks = chunks.filter((c) => c.name === 'course_id');
    expect(courseIdChunks).toHaveLength(2);
    // First branch: the lesson's placement — never the raw stored module.
    expect(courseIdChunks[0]?.table).not.toBe(modulesTable);
    // Fallback branch: explicitly the assignment's own stored module, and
    // only reachable when there is no lesson at all.
    expect(courseIdChunks[1]?.table).toBe(modulesTable);
    const idChunks = chunks.filter(
      (c) => c.name === 'id' && c.table === lessonsTable,
    );
    expect(idChunks.length).toBeGreaterThan(0);
  });

  // Mutant this catches: the courseId argument getting dropped or hardcoded
  // partway through a refactor (e.g. reusing a closed-over value instead of
  // the function's own parameter) — which would make every call scope
  // against the same course regardless of which one was actually asked for,
  // silently breaking the "a lesson taught by two courses answers to both"
  // guarantee the placements migration exists to provide.
  it('parameterizes the placement scope by whichever course is actually queried', async () => {
    const callsA: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    const callsB: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.select
      .mockReturnValueOnce(makeCapturingChain([], callsA))
      .mockReturnValueOnce(makeCapturingChain([], callsB));

    await getLibraryForCourse(101);
    await getLibraryForCourse(202);

    const tokensA = collectSqlTokens(callsA.where[0]);
    const tokensB = collectSqlTokens(callsB.where[0]);
    expect(tokensA).toContain('101');
    expect(tokensA).not.toContain('202');
    expect(tokensB).toContain('202');
    expect(tokensB).not.toContain('101');
  });
});

describe('getCourseSlugsForLibraryFile', () => {
  // Mirrors the getLibraryForCourse join tests above — same mutant, same
  // reasoning, different function. `#/db/library.ts` builds this query with
  // its own separate alias chain, so the rewrite has to be verified here
  // independently; fixing one function's join is not evidence the other one
  // was touched.
  it('joins module_lessons on lesson_id, never sourcing the placed module from lessons.module_id', async () => {
    const calls: JoinCalls = { innerJoin: [], leftJoin: [], where: [] };
    db.selectDistinct.mockReturnValueOnce(makeCapturingChain([], calls));

    await getCourseSlugsForLibraryFile(9);

    const moduleLessonsJoin = calls.leftJoin.find(
      ([table]) => table === moduleLessonsTable,
    );
    expect(moduleLessonsJoin).toBeDefined();
    expect(collectSqlTokens(moduleLessonsJoin?.[1])).toContain('lesson_id');

    const chunks = collectColumnChunks(calls.leftJoin.map(([, c]) => c));
    expect(
      chunks.some((c) => c.name === 'module_id' && c.table === lessonsTable),
    ).toBe(false);
    expect(
      chunks.some(
        (c) => c.name === 'module_id' && c.table === moduleLessonsTable,
      ),
    ).toBe(true);
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

  // The 11 module-only rows: no lesson at all, so `viaLesson` is null and the
  // fallback `viaModule` must carry the slug through. Mutant this catches: a
  // refactor that requires `viaLesson` unconditionally (e.g. `row.viaLesson!`
  // or filtering out rows where it's null) instead of the `??` fallback.
  it('resolves a module-only assignment (no lesson) via its module', async () => {
    db.selectDistinct.mockReturnValueOnce(
      makeChain([{ viaModule: 'safety-briefings', viaLesson: null }]),
    );

    expect(await getCourseSlugsForLibraryFile(9)).toEqual(['safety-briefings']);
  });

  // Mutant this catches: flipping the fallback to `row.viaModule ??
  // row.viaLesson`, which would file a mismatched row (module names one
  // course, the row's own lesson lives in another) under the WRONG course —
  // exactly the D8 bug this codebase has already hit once.
  it("prefers the lesson's course over the stored module's when a row resolves both", async () => {
    db.selectDistinct.mockReturnValueOnce(
      makeChain([{ viaModule: 'wrong-course', viaLesson: 'right-course' }]),
    );

    expect(await getCourseSlugsForLibraryFile(9)).toEqual(['right-course']);
  });

  // The behaviour change Task 5b is FOR: a lesson placed in two courses now
  // produces two distinct rows (one `module_lessons` join match per course),
  // and both slugs must survive into the returned list. Mutant this catches:
  // taking only the first resolved slug (e.g. `rows[0]?.viaLesson ??
  // rows[0]?.viaModule` or an early `return`) instead of accumulating into
  // the `Set` and returning every member — under the old single-valued
  // `lessons.module_id` join this scenario could never even arise, since a
  // lesson could only ever resolve to one course.
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
