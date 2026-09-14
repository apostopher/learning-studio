import { describe, expect, it } from 'vitest';
import {
  selectCourseModuleIds,
  upsertCourseModules,
} from './import-course-modules';

/**
 * A fake `q` (the shape `newQ` in import-course.ts satisfies) — genuinely
 * generic, matching the functions' own parameter type, so it type-checks
 * without a cast. Answers the one read the module loop issues (`select id
 * from modules where slug = $1`, fed from `existingBySlug`), hands back a
 * fresh id for each `insert into modules … returning id`, and records every
 * statement — SQL text AND params — so a test asserts on what the database
 * was handed, not on what the function returned.
 */
function fakeQ(opts: {
  existingBySlug?: Record<string, number>;
  nextInsertedId?: number;
  courseModuleIds?: number[];
} = {}) {
  const { existingBySlug = {}, courseModuleIds = [] } = opts;
  let nextId = opts.nextInsertedId ?? 100;
  const calls: { sql: string; params: unknown[] }[] = [];
  const q = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    calls.push({ sql, params });
    if (sql.includes('select id from modules where slug')) {
      const id = existingBySlug[params[0] as string];
      return (id === undefined ? [] : [{ id }]) as unknown as T[];
    }
    if (sql.includes('insert into modules')) {
      return [{ id: nextId++ }] as unknown as T[];
    }
    if (sql.includes('select module_id from course_modules')) {
      return courseModuleIds.map((module_id) => ({
        module_id,
      })) as unknown as T[];
    }
    return [] as T[];
  };
  return { q, calls };
}

const oldModule = (slug: string, rank: string) => ({
  name: slug.toUpperCase(),
  slug,
  required_subscriptions: ['basic'],
  rank,
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-02-01T00:00:00Z'),
});

const PLACEMENT_UPSERT =
  'insert into course_modules (course_id, module_id, rank) values ($1,$2,$3) on conflict (course_id, module_id) do update set rank = excluded.rank';

const collapse = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('upsertCourseModules', () => {
  // `modules.rank` is dropped by migrate-drop-module-rank.ts. Raw `pg` SQL is
  // invisible to tsc, so the only thing that catches a stray `rank=` in the
  // UPDATE/INSERT is reading the statement the pool was handed. Mutant:
  // leave `rank=$5` on the update — compiles, and 500s the import the moment
  // the column is gone.
  it('never writes modules.rank on the update or the insert', async () => {
    const { q, calls } = fakeQ({ existingBySlug: { intro: 7 } });

    await upsertCourseModules(q, 42, [
      oldModule('intro', '1'),
      oldModule('advanced', '2'),
    ]);

    const update = calls.find((c) => c.sql.includes('update modules set'));
    const insert = calls.find((c) => c.sql.includes('insert into modules'));
    expect(update).toBeDefined();
    expect(insert).toBeDefined();
    expect(collapse(update?.sql ?? '')).toBe(
      'update modules set course_id=$2, name=$3, required_subscriptions=$4, updated_at=$5 where id=$1',
    );
    expect(update?.params).toEqual([
      7,
      42,
      'INTRO',
      ['basic'],
      new Date('2024-02-01T00:00:00Z'),
    ]);
    expect(collapse(insert?.sql ?? '')).toBe(
      'insert into modules (course_id, name, slug, required_subscriptions, created_at, updated_at) values ($1,$2,$3,$4,$5,$6) returning id',
    );
    expect(insert?.params).toEqual([
      42,
      'ADVANCED',
      'advanced',
      ['basic'],
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-02-01T00:00:00Z'),
    ]);
  });

  // A module's position now lives on its `course_modules` placement — the
  // single definition of membership every reader (`courseModuleIds` in
  // `src/db/course-modules.ts`) goes through. A module row with no placement
  // is invisible to the board and the learner rail, and blocks
  // migrate-drop-module-rank.ts's orphan gate. Mutant: upsert the module and
  // never the placement — the old shape of this loop; every assertion on
  // the modules statements still passes.
  it('upserts a course_modules placement, keyed on (course, module), with the old rank, after EACH module write', async () => {
    const { q, calls } = fakeQ({
      existingBySlug: { intro: 7 },
      nextInsertedId: 100,
    });

    await upsertCourseModules(q, 42, [
      oldModule('intro', '1.5'),
      oldModule('advanced', '2'),
    ]);

    const placements = calls.filter((c) =>
      c.sql.includes('insert into course_modules'),
    );
    expect(placements).toHaveLength(2);
    for (const p of placements) expect(collapse(p.sql)).toBe(PLACEMENT_UPSERT);
    // Existing module: placed under its existing id, at the SOURCE rank —
    // a string, never parsed, so numeric(30,15) does not lose precision.
    expect(placements[0]?.params).toEqual([42, 7, '1.5']);
    // Fresh module: placed under the id the INSERT … returning handed back.
    expect(placements[1]?.params).toEqual([42, 100, '2']);

    // Ordering: each placement directly follows its own module write, so a
    // crash mid-loop leaves at most one module unplaced (and a re-run heals
    // it — every statement here upserts).
    const kinds = calls.map((c) =>
      c.sql.includes('update modules set')
        ? 'update-module'
        : c.sql.includes('insert into modules')
          ? 'insert-module'
          : c.sql.includes('insert into course_modules')
            ? 'place'
            : 'lookup',
    );
    expect(kinds).toEqual([
      'lookup',
      'update-module',
      'place',
      'lookup',
      'insert-module',
      'place',
    ]);
  });

  it('returns every module id by slug plus the inserted/updated tallies', async () => {
    const { q } = fakeQ({ existingBySlug: { intro: 7 }, nextInsertedId: 100 });

    const result = await upsertCourseModules(q, 42, [
      oldModule('intro', '1'),
      oldModule('advanced', '2'),
    ]);

    expect([...result.moduleIdBySlug]).toEqual([
      ['intro', 7],
      ['advanced', 100],
    ]);
    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(1);
  });
});

describe('selectCourseModuleIds', () => {
  // Membership, not ownership: `modules.course_id` is who OWNS a module;
  // which modules a course SHOWS is `course_modules`. The lesson-placement
  // lookup this feeds (`healDuplicatePlacements`) must see the same module
  // set `movePlacement` and the board see, or an admin-placed module from
  // another course is invisible and the import creates a second placement.
  // Mutant: `select id from modules where course_id = $1` (the old scope).
  it('reads membership from course_modules, not from modules.course_id', async () => {
    const { q, calls } = fakeQ({ courseModuleIds: [7, 100] });

    const ids = await selectCourseModuleIds(q, 42);

    expect(ids).toEqual([7, 100]);
    expect(calls).toHaveLength(1);
    expect(collapse(calls[0]?.sql ?? '')).toBe(
      'select module_id from course_modules where course_id = $1',
    );
    expect(calls[0]?.params).toEqual([42]);
  });
});
