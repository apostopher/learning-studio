// src/db/__tests__/course-remixes.test.ts
// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

/**
 * A minimal transaction double. Every builder method returns the same
 * object; `then` resolves the next queued result. `inserts` and `deletes`
 * record the table and values/where handed over, which is what these tests
 * assert on — the rows the placement table RECEIVED, not that a function
 * returned something.
 */
const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    inserts: [] as Array<{
      table: unknown;
      values: unknown;
      onConflict: boolean;
    }>,
    deletes: [] as Array<{ table: unknown; where: unknown }>,
    selects: [] as Array<{
      from?: unknown;
      where?: unknown;
      joinOn: unknown[];
      orderBy: unknown[];
    }>,
  };
  function chain(kind?: 'insert' | 'delete', table?: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    let current: {
      from?: unknown;
      where?: unknown;
      joinOn: unknown[];
      orderBy: unknown[];
    } = {
      joinOn: [],
      orderBy: [],
    };
    let insertRecord: {
      table: unknown;
      values: unknown;
      onConflict: boolean;
    } | null =
      kind === 'insert'
        ? { table, values: undefined, onConflict: false }
        : null;
    for (const name of [
      'select',
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'orderBy',
      'values',
      'onConflictDoNothing',
      'returning',
      'limit',
    ]) {
      c[name] = (...args: unknown[]) => {
        if (name === 'from') current.from = args[0];
        if (name === 'innerJoin' || name === 'leftJoin')
          current.joinOn.push(args[1]);
        if (name === 'orderBy') current.orderBy.push(...args);
        if (name === 'where') {
          current.where = args[0];
          if (kind === 'delete') state.deletes.push({ table, where: args[0] });
        }
        if (name === 'values' && insertRecord) insertRecord.values = args[0];
        if (name === 'onConflictDoNothing' && insertRecord)
          insertRecord.onConflict = true;
        return c;
      };
    }
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      if (kind === undefined) state.selects.push({ ...current });
      if (insertRecord) state.inserts.push(insertRecord);
      current = { joinOn: [], orderBy: [] };
      insertRecord = null;
      return Promise.resolve(state.results.shift() ?? []).then(resolve, reject);
    };
    return c;
  }
  const tx = {
    select: () => chain(),
    insert: (table: unknown) => chain('insert', table),
    delete: (table: unknown) => chain('delete', table),
  };
  const db = {
    ...tx,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { state, db };
});
vi.mock('#/db', () => ({ db: fake.db }));
const cache = vi.hoisted(() => ({
  invalidateCourseDetailsCache: vi.fn(),
  getCourseSlugForCourseId: vi.fn(async (id: number) => `course-${id}`),
}));
vi.mock('#/db/course-cache', () => ({
  invalidateCourseDetailsCache: cache.invalidateCourseDetailsCache,
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForCourseId: cache.getCourseSlugForCourseId,
}));

const {
  remixCourse,
  unremixCourse,
  countRemixers,
  getRemixSourceIds,
  getRemixerCourseIds,
} = await import('../course-remixes');
const { courseModulesTable, courseRemixesTable, modulesTable } = await import(
  '../schema'
);

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.results.length = 0;
  fake.state.inserts.length = 0;
  fake.state.deletes.length = 0;
  fake.state.selects.length = 0;
});

const ORG = 1;

describe('remixCourse', () => {
  it('refuses a course remixing itself before touching the database', async () => {
    const result = await remixCourse({
      orgId: ORG,
      courseId: 2,
      sourceCourseId: 2,
      actorId: 'u1',
    });
    expect(result).toEqual({ ok: false, reason: 'self' });
    expect(fake.state.selects).toHaveLength(0);
    expect(fake.state.inserts).toHaveLength(0);
  });

  it('reads as not-found when either course is outside the org', async () => {
    fake.state.results.push([{ courseId: 2 }]); // only the remixer is in the org
    const result = await remixCourse({
      orgId: ORG,
      courseId: 2,
      sourceCourseId: 6,
      actorId: 'u1',
    });
    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(fake.state.inserts).toHaveLength(0);
  });

  it('reports already-remixed when the link row already exists, placing nothing', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]); // org check
    fake.state.results.push([]); // insert … on conflict do nothing → no row
    const result = await remixCourse({
      orgId: ORG,
      courseId: 2,
      sourceCourseId: 6,
      actorId: 'u1',
    });
    expect(result).toEqual({ ok: false, reason: 'already-remixed' });
    expect(fake.state.inserts).toHaveLength(1);
    expect(fake.state.inserts[0].table).toBe(courseRemixesTable);
  });

  /**
   * Mutant this catches: selecting the source's PLACEMENTS (`course_modules
   * where course_id = source`) instead of the modules it OWNS. Both return
   * the same rows until the source itself remixes something — then the
   * placement version carries borrowed modules across a second hop, which
   * the spec rules out (no transitivity; it is what keeps A⇄B finite).
   */
  it('places only the modules the source OWNS, in the source’s own order, appended after the remixer’s last rank', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]); // org check
    fake.state.results.push([{ id: 1 }]); // link row inserted
    fake.state.results.push([
      { moduleId: 10, rank: '1' },
      { moduleId: 11, rank: '2.5' },
    ]); // owned modules
    fake.state.results.push([{ maxRank: '3' }]); // remixer's current max rank
    fake.state.results.push([]); // placement insert

    const result = await remixCourse({
      orgId: ORG,
      courseId: 2,
      sourceCourseId: 6,
      actorId: 'u1',
    });

    expect(result).toEqual({ ok: true, moduleCount: 2 });
    // The owned-modules query: FROM modules, filtered on the OWNER column.
    const owned = fake.state.selects[1];
    expect(owned.from).toBe(modulesTable);
    expect(renderSql(owned.where as SQL)).toBe('"modules"."course_id" = $1');
    expect(renderSqlParams(owned.where as SQL)).toEqual([6]);
    // …joined to the source's placements for ORDER only.
    expect(renderSql(owned.joinOn[0] as SQL)).toBe(
      '("course_modules"."module_id" = "modules"."id" and "course_modules"."course_id" = $1)',
    );
    // …ordered by the source's own rank, tie-broken by module id.
    expect(owned.orderBy.map((o) => renderSql(o as SQL))).toEqual([
      '"course_modules"."rank" asc',
      '"modules"."id" asc',
    ]);
    // The placement rows the remixer's rail received.
    const placement = fake.state.inserts[1];
    expect(placement.table).toBe(courseModulesTable);
    expect(placement.values).toEqual([
      { courseId: 2, moduleId: 10, rank: '4' },
      { courseId: 2, moduleId: 11, rank: '5' },
    ]);
    expect(placement.onConflict).toBe(true);
  });

  it('records who remixed, on the link row', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]);
    fake.state.results.push([{ id: 1 }]);
    fake.state.results.push([]); // no owned modules
    fake.state.results.push([{ maxRank: null }]);
    await remixCourse({
      orgId: ORG,
      courseId: 2,
      sourceCourseId: 6,
      actorId: 'user_abc',
    });
    expect(fake.state.inserts[0].values).toEqual({
      courseId: 2,
      sourceCourseId: 6,
      createdBy: 'user_abc',
    });
  });

  it('invalidates the REMIXER’s learner payload, not the source’s', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]);
    fake.state.results.push([{ id: 1 }]);
    fake.state.results.push([]);
    fake.state.results.push([{ maxRank: null }]);
    await remixCourse({
      orgId: ORG,
      courseId: 2,
      sourceCourseId: 6,
      actorId: null,
    });
    expect(cache.invalidateCourseDetailsCache).toHaveBeenCalledWith('course-2');
    expect(cache.invalidateCourseDetailsCache).not.toHaveBeenCalledWith(
      'course-6',
    );
  });
});

describe('unremixCourse', () => {
  it('reads as not-found when no link exists, deleting no placements', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]);
    fake.state.results.push([]); // delete link → nothing
    const result = await unremixCourse({
      orgId: ORG,
      courseId: 2,
      sourceCourseId: 6,
    });
    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(fake.state.deletes).toHaveLength(1);
    expect(fake.state.deletes[0].table).toBe(courseRemixesTable);
  });

  /**
   * Mutant this catches: deleting every placement in the remixer (dropping
   * the module-owner filter), or deleting the SOURCE's placements. The WHERE
   * pins both the remixer's course id and the owner subquery.
   */
  it('deletes exactly the remixer’s placements of modules the source owns', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]);
    fake.state.results.push([{ id: 1 }]); // link deleted
    fake.state.results.push([{ id: 7 }, { id: 8 }, { id: 9 }]); // placements deleted
    const result = await unremixCourse({
      orgId: ORG,
      courseId: 2,
      sourceCourseId: 6,
    });
    expect(result).toEqual({ ok: true, moduleCount: 3 });
    const placements = fake.state.deletes[1];
    expect(placements.table).toBe(courseModulesTable);
    expect(renderSql(placements.where as SQL)).toBe(
      '("course_modules"."course_id" = $1 and "course_modules"."module_id" in (select "modules"."id" from "modules" where "modules"."course_id" = $2))',
    );
    expect(renderSqlParams(placements.where as SQL)).toEqual([2, 6]);
    expect(cache.invalidateCourseDetailsCache).toHaveBeenCalledWith('course-2');
  });
});

describe('countRemixers', () => {
  it('counts link rows whose SOURCE is the course', async () => {
    fake.state.results.push([{ n: 3 }]);
    expect(await countRemixers(6)).toBe(3);
    expect(renderSql(fake.state.selects[0].where as SQL)).toBe(
      '"course_remixes"."source_course_id" = $1',
    );
  });
});

describe('getRemixSourceIds', () => {
  /**
   * Mutant this catches: filtering on `source_course_id` instead of
   * `course_id` — both compile and both return a `number[]`, but that would
   * answer "who borrows from this course" instead of "what this course
   * borrows from".
   */
  it('returns the courses THIS one borrows from', async () => {
    fake.state.results.push([{ sourceCourseId: 6 }, { sourceCourseId: 7 }]);
    expect(await getRemixSourceIds(2)).toEqual([6, 7]);
    expect(renderSql(fake.state.selects[0].where as SQL)).toBe(
      '"course_remixes"."course_id" = $1',
    );
    expect(renderSqlParams(fake.state.selects[0].where as SQL)).toEqual([2]);
  });
});

describe('getRemixerCourseIds', () => {
  /**
   * Mutant this catches: filtering on `course_id` instead of
   * `source_course_id` — both compile and both return a `number[]`, but that
   * would answer "what this course borrows from" instead of "who borrows
   * from this course".
   */
  it('returns the courses BORROWING FROM this one', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 3 }]);
    expect(await getRemixerCourseIds(6)).toEqual([2, 3]);
    expect(renderSql(fake.state.selects[0].where as SQL)).toBe(
      '"course_remixes"."source_course_id" = $1',
    );
    expect(renderSqlParams(fake.state.selects[0].where as SQL)).toEqual([6]);
  });
});
