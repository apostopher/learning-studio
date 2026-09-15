// src/db/__tests__/discipline-modules.test.ts
// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

/**
 * A builder double in the shape of course-remixes.test.ts's: every method
 * returns the chain; `then` resolves the next queued result; selects,
 * inserts, updates and deletes are recorded with what they were handed.
 */
const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    selects: [] as Array<{ from: unknown; where: unknown }>,
    inserts: [] as Array<{ table: unknown; values: unknown }>,
    updates: [] as Array<{ table: unknown; set: unknown; where: unknown }>,
    deletes: [] as Array<{ table: unknown; where: unknown }>,
  };
  function chain(
    kind: 'select' | 'insert' | 'update' | 'delete',
    table?: unknown,
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    const rec: Record<string, unknown> = { table };
    for (const name of [
      'select',
      'from',
      'where',
      'orderBy',
      'values',
      'set',
      'returning',
      'limit',
      'innerJoin',
      'leftJoin',
    ]) {
      c[name] = (...args: unknown[]) => {
        if (name === 'from') rec.from = args[0];
        if (name === 'where') rec.where = args[0];
        if (name === 'values') rec.values = args[0];
        if (name === 'set') rec.set = args[0];
        return c;
      };
    }
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      if (kind === 'select') state.selects.push(rec as never);
      if (kind === 'insert') state.inserts.push(rec as never);
      if (kind === 'update') state.updates.push(rec as never);
      if (kind === 'delete') state.deletes.push(rec as never);
      return Promise.resolve(state.results.shift() ?? []).then(resolve, reject);
    };
    return c;
  }
  const db = {
    select: () => chain('select'),
    insert: (t: unknown) => chain('insert', t),
    update: (t: unknown) => chain('update', t),
    delete: (t: unknown) => chain('delete', t),
  };
  return { state, db };
});
vi.mock('#/db', () => ({ db: fake.db }));

const {
  createDisciplineModule,
  reorderDisciplineModule,
  deleteDisciplineModule,
  placeLessonInLibrary,
  getDisciplineIdForDisciplineModule,
} = await import('../discipline-modules');
const { disciplineModulesTable, lessonsTable } = await import('../schema');

beforeEach(() => {
  fake.state.results.length = 0;
  fake.state.selects.length = 0;
  fake.state.inserts.length = 0;
  fake.state.updates.length = 0;
  fake.state.deletes.length = 0;
});

describe('createDisciplineModule', () => {
  it('appends after the discipline’s last module', async () => {
    fake.state.results.push([{ maxRank: '3' }]);
    fake.state.results.push([{ id: 5, name: 'Basics', rank: '4' }]);
    const created = await createDisciplineModule(4, 'Basics');
    expect(renderSql(fake.state.selects[0].where as SQL)).toBe(
      '"discipline_modules"."discipline_id" = $1',
    );
    expect(renderSqlParams(fake.state.selects[0].where as SQL)).toEqual([4]);
    expect(fake.state.inserts[0].table).toBe(disciplineModulesTable);
    expect(fake.state.inserts[0].values).toEqual({
      disciplineId: 4,
      name: 'Basics',
      rank: '4',
    });
    expect(created).toEqual({ id: 5, name: 'Basics', rank: 4 });
  });
});

describe('reorderDisciplineModule', () => {
  /**
   * Mutant this catches: neighbour ranks read by module id alone. A prev
   * from another discipline would then hand this module a rank in the
   * wrong list, and the two disciplines' orders would interleave.
   */
  it('reads each neighbour’s rank only within the module’s own discipline, and pins the update to the module', async () => {
    fake.state.results.push([{ disciplineId: 4 }]); // the module's discipline
    fake.state.results.push([
      { id: 6, rank: '2' },
      { id: 8, rank: '3' },
    ]); // the neighbours, scoped to that discipline
    fake.state.results.push([{ id: 7, rank: '2.5' }]); // update … returning
    const out = await reorderDisciplineModule({
      moduleId: 7,
      prevModuleId: 6,
      nextModuleId: 8,
    });
    const neighbourSelect = fake.state.selects[1];
    expect(renderSql(neighbourSelect.where as SQL)).toBe(
      '("discipline_modules"."id" in ($1, $2) and "discipline_modules"."discipline_id" = $3)',
    );
    expect(renderSqlParams(neighbourSelect.where as SQL)).toEqual([6, 8, 4]);
    const upd = fake.state.updates[0];
    expect(upd.table).toBe(disciplineModulesTable);
    expect(renderSql(upd.where as SQL)).toBe('"discipline_modules"."id" = $1');
    expect(renderSqlParams(upd.where as SQL)).toEqual([7]);
    const set = upd.set as { rank: string };
    expect(set.rank).toBe('2.5');
    expect(out).toEqual({ id: 7, rank: 2.5 });
  });

  it('answers null for an unknown module without writing', async () => {
    fake.state.results.push([]);
    expect(
      await reorderDisciplineModule({
        moduleId: 7,
        prevModuleId: 6,
        nextModuleId: null,
      }),
    ).toBeNull();
    expect(fake.state.updates).toHaveLength(0);
  });

  /**
   * Mutant this catches: a stale/foreign neighbour id silently resolving to
   * a rank of NULL (or 0) instead of refusing. `rank` is NOT NULL in the
   * database, so if this refusal weren't decided before the write, a real
   * UPDATE would raise a not-null violation instead of answering null.
   */
  it('answers null when a named neighbour isn’t in the module’s discipline, without writing', async () => {
    fake.state.results.push([{ disciplineId: 4 }]); // the module's discipline
    fake.state.results.push([{ id: 6, rank: '2' }]); // only prev comes back; 8 is elsewhere
    const out = await reorderDisciplineModule({
      moduleId: 7,
      prevModuleId: 6,
      nextModuleId: 8,
    });
    expect(out).toBeNull();
    expect(fake.state.updates).toHaveLength(0);
  });
});

describe('deleteDisciplineModule', () => {
  it('counts the lessons that return to Untitled, deletes only the module row, and never a lesson', async () => {
    fake.state.results.push([{ n: 3 }]);
    fake.state.results.push([{ id: 7 }]);
    const out = await deleteDisciplineModule(7);
    expect(out).toEqual({ ok: true, lessonsReturned: 3 });
    expect(fake.state.deletes).toHaveLength(1);
    expect(fake.state.deletes[0].table).toBe(disciplineModulesTable);
    expect(renderSql(fake.state.deletes[0].where as SQL)).toBe(
      '"discipline_modules"."id" = $1',
    );
    expect(fake.state.updates).toHaveLength(0);
  });
});

describe('placeLessonInLibrary', () => {
  it('refuses a module of another discipline, naming both, and writes nothing', async () => {
    fake.state.results.push([{ disciplineId: 4, disciplineName: 'Weather' }]); // lesson
    fake.state.results.push([
      { disciplineId: 9, disciplineName: 'Navigation' },
    ]); // module
    const out = await placeLessonInLibrary({
      lessonId: 10,
      disciplineModuleId: 7,
      prevLessonId: null,
      nextLessonId: null,
    });
    expect(out).toEqual({
      ok: false,
      reason: 'wrong-discipline',
      lessonDiscipline: 'Weather',
      moduleDiscipline: 'Navigation',
    });
    expect(fake.state.updates).toHaveLength(0);
  });

  /**
   * Mutant this catches: a neighbour's rank read without scoping it to the
   * same module (or to Untitled of the same discipline) — a rank borrowed
   * from another box places the lesson in the wrong order there.
   */
  it('sets the module and a midpoint library_rank between neighbours IN THAT MODULE, pinned to the one lesson', async () => {
    fake.state.results.push([{ disciplineId: 4, disciplineName: 'Weather' }]);
    fake.state.results.push([{ disciplineId: 4, disciplineName: 'Weather' }]);
    fake.state.results.push([{ id: 10, libraryRank: '1.5' }]);
    const out = await placeLessonInLibrary({
      lessonId: 10,
      disciplineModuleId: 7,
      prevLessonId: 11,
      nextLessonId: 12,
    });
    const upd = fake.state.updates[0];
    expect(upd.table).toBe(lessonsTable);
    expect(renderSql(upd.where as SQL)).toBe('"lessons"."id" = $1');
    const set = upd.set as {
      disciplineModuleId: number | null;
      libraryRank: SQL;
    };
    expect(set.disciplineModuleId).toBe(7);
    expect(renderSql(set.libraryRank)).toBe(
      '(coalesce((select "lessons"."library_rank" from "lessons" where "lessons"."id" = $1 and "lessons"."discipline_module_id" = $2), 0) + coalesce((select "lessons"."library_rank" from "lessons" where "lessons"."id" = $3 and "lessons"."discipline_module_id" = $4), 0)) / 2',
    );
    expect(renderSqlParams(set.libraryRank)).toEqual([11, 7, 12, 7]);
    expect(out).toEqual({ ok: true, rank: 1.5 });
  });

  it('files into Untitled (null module) scoped to the lesson’s discipline, appending after the last', async () => {
    fake.state.results.push([{ disciplineId: 4, disciplineName: 'Weather' }]);
    fake.state.results.push([{ id: 10, libraryRank: '3' }]);
    const out = await placeLessonInLibrary({
      lessonId: 10,
      disciplineModuleId: null,
      prevLessonId: 11,
      nextLessonId: null,
    });
    const set = fake.state.updates[0].set as {
      disciplineModuleId: number | null;
      libraryRank: SQL;
    };
    expect(set.disciplineModuleId).toBeNull();
    expect(renderSql(set.libraryRank)).toBe(
      'coalesce((select "lessons"."library_rank" from "lessons" where "lessons"."id" = $1 and "lessons"."discipline_module_id" is null and "lessons"."discipline_id" = $2), 0) + 1',
    );
    expect(renderSqlParams(set.libraryRank)).toEqual([11, 4]);
    expect(out).toEqual({ ok: true, rank: 3 });
  });

  it('answers not-found for an unknown lesson', async () => {
    fake.state.results.push([]);
    expect(
      await placeLessonInLibrary({
        lessonId: 10,
        disciplineModuleId: null,
        prevLessonId: null,
        nextLessonId: null,
      }),
    ).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('getDisciplineIdForDisciplineModule', () => {
  it('reads the module’s discipline', async () => {
    fake.state.results.push([{ disciplineId: 4 }]);
    expect(await getDisciplineIdForDisciplineModule(7)).toBe(4);
    expect(renderSql(fake.state.selects[0].where as SQL)).toBe(
      '"discipline_modules"."id" = $1',
    );
  });
});
