import { describe, expect, it } from 'vitest';
import {
  disciplineModuleName,
  fileLessonsIntoDisciplineModules,
  upsertDisciplineModules,
} from './import-discipline-modules';

/**
 * A fake `q` (the shape `newQ` in the runner satisfies) — generic, so it
 * type-checks without a cast. It answers the two reads the loops issue and
 * records every statement, SQL text AND params, so the tests assert on what
 * the database was handed rather than on what the functions returned.
 */
function fakeQ(
  opts: {
    moduleIdByName?: Record<string, number>;
    lessonBySlug?: Record<
      string,
      {
        id: number;
        discipline_id: number | null;
        discipline_module_id: number | null;
      }
    >;
    nextInsertedId?: number;
  } = {},
) {
  const { moduleIdByName = {}, lessonBySlug = {} } = opts;
  let nextId = opts.nextInsertedId ?? 500;
  const calls: { sql: string; params: unknown[] }[] = [];
  const q = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    calls.push({ sql, params });
    if (sql.includes('select id from discipline_modules')) {
      const id = moduleIdByName[params[1] as string];
      return (id === undefined ? [] : [{ id }]) as unknown as T[];
    }
    if (sql.includes('insert into discipline_modules')) {
      return [{ id: nextId++ }] as unknown as T[];
    }
    if (sql.includes('from lessons where slug')) {
      const row = lessonBySlug[params[0] as string];
      return (row === undefined ? [] : [row]) as unknown as T[];
    }
    return [] as T[];
  };
  return { q, calls };
}

const collapse = (sql: string) => sql.replace(/\s+/g, ' ').trim();
const oldModule = (slug: string, name: string, rank: string) => ({
  slug,
  name,
  rank,
});
const oldLesson = (slug: string, module_slug: string, rank: string) => ({
  slug,
  module_slug,
  rank,
});

describe('disciplineModuleName', () => {
  it('strips the source order prefix, which `rank` already carries', () => {
    expect(disciplineModuleName('0 - Intro & Background')).toBe(
      'Intro & Background',
    );
    expect(disciplineModuleName('7 - ITPS UAS REMOTE')).toBe('ITPS UAS REMOTE');
  });

  it('leaves a name that merely starts with a digit alone', () => {
    // Mutant: `replace(/^\d+\s*/, '')` — which would file the flagship's own
    // "3D Airmanship Intro" module as "D Airmanship Intro".
    expect(disciplineModuleName('3D Airmanship Intro & Bkgnd')).toBe(
      '3D Airmanship Intro & Bkgnd',
    );
  });
});

describe('upsertDisciplineModules', () => {
  it('inserts a missing module under the discipline, at the source rank, with the prefix stripped', async () => {
    const { q, calls } = fakeQ({ nextInsertedId: 77 });

    const result = await upsertDisciplineModules(q, 4, [
      oldModule('intro', '0 - Intro & Background', '1.00000'),
    ]);

    const insert = calls.find((c) =>
      c.sql.includes('insert into discipline_modules'),
    );
    expect(insert && collapse(insert.sql)).toBe(
      'insert into discipline_modules (discipline_id, name, rank) values ($1,$2,$3) returning id',
    );
    expect(insert?.params).toEqual([4, 'Intro & Background', '1.00000']);
    // The id the caller files lessons with is keyed by the SOURCE slug: the
    // destination module has no slug of its own to look it up by.
    expect(result.moduleIdByOldSlug.get('intro')).toBe(77);
    expect(result).toMatchObject({ inserted: 1, updated: 0 });
  });

  it('re-ranks an existing module instead of creating a second one with the same name', async () => {
    // Mutant: keying the upsert on the source slug (which the destination
    // does not store) — every re-run would then insert a duplicate module
    // and the admin would watch their column double.
    const { q, calls } = fakeQ({ moduleIdByName: { 'New Awareness': 31 } });

    const result = await upsertDisciplineModules(q, 4, [
      oldModule('new-awareness', '2 - New Awareness', '3.00000'),
    ]);

    expect(calls.some((c) => c.sql.includes('insert into discipline_modules'))).
      toBe(false);
    const update = calls.find((c) =>
      c.sql.includes('update discipline_modules'),
    );
    expect(update && collapse(update.sql)).toBe(
      'update discipline_modules set rank = $2, updated_at = now() where id = $1',
    );
    expect(update?.params).toEqual([31, '3.00000']);
    expect(result).toMatchObject({ inserted: 0, updated: 1 });
    expect(result.moduleIdByOldSlug.get('new-awareness')).toBe(31);
  });

  it('scopes the lookup to this discipline, so two disciplines may hold a module of the same name', async () => {
    const { q, calls } = fakeQ();
    await upsertDisciplineModules(q, 4, [
      oldModule('intro', 'Intro', '1.00000'),
    ]);
    const read = calls[0];
    expect(collapse(read.sql)).toBe(
      'select id from discipline_modules where discipline_id = $1 and name = $2',
    );
    expect(read.params).toEqual([4, 'Intro']);
  });
});

describe('fileLessonsIntoDisciplineModules', () => {
  const modules = new Map([['intro', 77]]);

  it('files an unfiled lesson into its module at the source rank, pinned by id', async () => {
    const { q, calls } = fakeQ({
      lessonBySlug: {
        origins: { id: 3, discipline_id: null, discipline_module_id: null },
      },
    });

    const report = await fileLessonsIntoDisciplineModules(q, 4, modules, [
      oldLesson('origins', 'intro', '2.00000'),
    ]);

    const update = calls.find((c) => c.sql.includes('update lessons'));
    // The whole blast radius on the lessons table, asserted as SQL text: a
    // mutant that dropped the `where` — or reached for `name`/`slug`/
    // `is_available` — would rewrite production content, and tsc cannot see
    // into a raw `pg` string.
    expect(update && collapse(update.sql)).toBe(
      'update lessons set discipline_id = $2, discipline_module_id = $3, library_rank = $4, updated_at = now() where id = $1',
    );
    expect(update?.params).toEqual([3, 4, 77, '2.00000']);
    expect(report).toMatchObject({ filed: 1, missing: [], alreadyOrganised: [] });
  });

  it('leaves an already-filed lesson exactly where the SME put it', async () => {
    // The reason a re-run is safe: the first run files, a human then drags,
    // and the next run must not drag it back. Mutant: filing unconditionally.
    const { q, calls } = fakeQ({
      lessonBySlug: {
        origins: { id: 3, discipline_id: 4, discipline_module_id: 99 },
      },
    });

    const report = await fileLessonsIntoDisciplineModules(q, 4, modules, [
      oldLesson('origins', 'intro', '2.00000'),
    ]);

    expect(calls.some((c) => c.sql.includes('update lessons'))).toBe(false);
    expect(report).toMatchObject({ filed: 0, alreadyOrganised: ['origins'] });
  });

  it('leaves a lesson that belongs to another discipline alone, and says so', async () => {
    const { q, calls } = fakeQ({
      lessonBySlug: {
        origins: { id: 3, discipline_id: 9, discipline_module_id: null },
      },
    });

    const report = await fileLessonsIntoDisciplineModules(q, 4, modules, [
      oldLesson('origins', 'intro', '2.00000'),
    ]);

    expect(calls.some((c) => c.sql.includes('update lessons'))).toBe(false);
    expect(report.otherDiscipline).toEqual([{ slug: 'origins', disciplineId: 9 }]);
    expect(report.alreadyOrganised).toEqual([]);
  });

  it('reports a source lesson the destination does not have, and creates nothing', async () => {
    // Mutant: inserting the missing lesson. This script files what exists;
    // importing content is `import-course.ts`'s job.
    const { q, calls } = fakeQ({ lessonBySlug: {} });

    const report = await fileLessonsIntoDisciplineModules(q, 4, modules, [
      oldLesson('ghost', 'intro', '2.00000'),
    ]);

    expect(calls.some((c) => c.sql.includes('insert into lessons'))).toBe(false);
    expect(report).toMatchObject({ filed: 0, missing: ['ghost'] });
  });

  it('refuses a lesson whose source module was never upserted rather than filing it into Untitled', async () => {
    const { q } = fakeQ({
      lessonBySlug: {
        origins: { id: 3, discipline_id: null, discipline_module_id: null },
      },
    });

    await expect(
      fileLessonsIntoDisciplineModules(q, 4, modules, [
        oldLesson('origins', 'unknown-module', '2.00000'),
      ]),
    ).rejects.toThrow('unknown-module');
  });
});
