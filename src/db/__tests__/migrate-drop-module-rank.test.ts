// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modulesTable } from '../schema';

const db = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock('#/db', () => ({ db }));

const { migrateDropModuleRank } = await import('#/db/migrate-drop-module-rank');
const { migrateRelaxModuleRank } = await import(
  '#/db/migrate-relax-module-rank'
);
// Captured BEFORE any beforeEach can clear it: what importing the two
// modules did to the database collaborator.
const executeCallsAtImport = db.execute.mock.calls.length;
const transactionCallsAtImport = db.transaction.mock.calls.length;

type Query = { queryChunks?: Array<{ value?: unknown }> };

/**
 * Flatten one executed statement into a single lowercase, whitespace-
 * collapsed string. Same house pattern as the sibling migrations' tests —
 * see `drop-lesson-module-id-migration.test.ts` for why `.value` is pulled
 * out of each `StringChunk` by hand.
 */
function textOf(query: Query): string {
  return (query.queryChunks ?? [])
    .map((chunk) => (Array.isArray(chunk.value) ? chunk.value.join('') : ''))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function statements(): string[] {
  return db.execute.mock.calls.map((c) => textOf(c[0] as Query));
}

// Matches the migrations' ACTUAL probe predicate, schema-qualified (fix
// round 1, minor: without `table_schema = 'public'` a same-named table in
// another schema could answer for this one). A mutant that dropped the
// qualifier, or probed another table/column, is not "recognized" here and
// falls through to the empty default, which the tests below detect.
const COLUMN_PROBE =
  "where table_schema = 'public' and table_name = 'modules' and column_name = 'rank'";
const IS_NULLABLE_PROBE = `select is_nullable from information_schema.columns ${COLUMN_PROBE}`;
const COLUMN_NAME_PROBE = `select column_name from information_schema.columns ${COLUMN_PROBE}`;
const AFTER_DROP_PROBE = `select count(*)::int as n from information_schema.columns ${COLUMN_PROBE}`;
const ORPHAN_PROBE = 'select count(*)::int as orphans from modules m';

/**
 * Real driver shape: `db.execute` resolves to `{ rows, ... }`, never a bare
 * array. Every probe the two migrations read is answered here from one
 * description of the live column, so a test states the database and reads
 * what the migration did to it.
 */
function mockDatabase(
  state: {
    column?: 'absent' | 'not null' | 'nullable';
    orphans?: number;
    stillPresentAfterDrop?: boolean;
  } = {},
): void {
  const {
    column = 'not null',
    orphans = 0,
    stillPresentAfterDrop = false,
  } = state;
  db.execute.mockImplementation((query: Query) => {
    const text = textOf(query);
    if (text.includes(IS_NULLABLE_PROBE)) {
      return Promise.resolve({
        rows:
          column === 'absent'
            ? []
            : [{ is_nullable: column === 'nullable' ? 'YES' : 'NO' }],
      });
    }
    if (text.includes(COLUMN_NAME_PROBE)) {
      return Promise.resolve({
        rows: column === 'absent' ? [] : [{ column_name: 'rank' }],
      });
    }
    if (text.includes(ORPHAN_PROBE)) {
      return Promise.resolve({ rows: [{ orphans }] });
    }
    if (text.includes(AFTER_DROP_PROBE)) {
      return Promise.resolve({ rows: [{ n: stillPresentAfterDrop ? 1 : 0 }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.execute.mockReset();
  db.transaction.mockReset();
  mockDatabase();
});

describe('modules.rank is gone', () => {
  /**
   * A superseded column left in a live database is what destroyed 87 lessons
   * on 2026-09-11 (`lessons.module_id`, still cascading long after `schema.ts`
   * stopped declaring it). This asserts the schema no longer offers it; the
   * migration's own verification asserts the database agrees.
   */
  it('is not declared on the table any more', () => {
    expect('rank' in modulesTable).toBe(false);
  });
});

describe('importing either migration module', () => {
  /**
   * Both files guard their entry point on `process.argv[1]` (house pattern
   * from migrate-course-modules.ts) so importing never touches the
   * database. Asserted on the collaborator — `db.execute` — not on "it
   * didn't throw": an unguarded top-level call would run the
   * `information_schema` probe (and, on a real connection, the DDL) the
   * moment anything imported it.
   */
  it('runs nothing against the database', () => {
    expect(executeCallsAtImport).toBe(0);
    expect(transactionCallsAtImport).toBe(0);
  });
});

describe('migrateRelaxModuleRank (phase 1, before the deploy)', () => {
  it('drops NOT NULL when the column is still NOT NULL (first run)', async () => {
    mockDatabase({ column: 'not null' });

    await migrateRelaxModuleRank();

    expect(statements().join('\n')).toContain(
      'alter table "modules" alter column "rank" drop not null',
    );
  });

  // Idempotent on a re-run: the ALTER is harmless to repeat, but the point
  // of the probe is that this script says what it did — and a mutant that
  // skipped the probe and always altered would also raise on a database
  // where the column is already gone (below).
  it('is a no-op when the column is already nullable', async () => {
    mockDatabase({ column: 'nullable' });

    await migrateRelaxModuleRank();

    expect(statements().join('\n')).not.toContain('alter table');
  });

  // `alter column … drop not null` has no `if exists` form — the column
  // must exist or Postgres raises. Idempotent PAST the drop: once phase 2
  // has run, this must return cleanly without emitting the ALTER.
  it('is a no-op once the column has already been dropped', async () => {
    mockDatabase({ column: 'absent' });

    await expect(migrateRelaxModuleRank()).resolves.toBeUndefined();

    expect(statements().join('\n')).not.toContain('alter table');
  });

  it('probes before altering (ordering)', async () => {
    mockDatabase({ column: 'not null' });

    await migrateRelaxModuleRank();

    const all = statements();
    const probeIndex = all.findIndex((s) => s.includes(IS_NULLABLE_PROBE));
    const alterIndex = all.findIndex((s) => s.includes('drop not null'));
    expect(probeIndex).toBeGreaterThanOrEqual(0);
    expect(alterIndex).toBeGreaterThan(probeIndex);
  });
});

describe('migrateDropModuleRank (phase 2, after the deploy)', () => {
  it('drops the column when it is present and every module is placed', async () => {
    mockDatabase({ column: 'nullable', orphans: 0 });

    await migrateDropModuleRank();

    expect(statements().join('\n')).toContain(
      'alter table "modules" drop column "rank"',
    );
  });

  it('is a no-op when the column is already gone', async () => {
    mockDatabase({ column: 'absent' });

    await expect(migrateDropModuleRank()).resolves.toBeUndefined();

    const all = statements().join('\n');
    expect(all).not.toContain('drop column');
    // Nor does it bother counting orphans on a database it will not touch.
    expect(all).not.toContain(ORPHAN_PROBE);
  });

  // Dropping the column would destroy the only record of an unplaced
  // module's position. Refused BEFORE any DDL — asserted on the statements
  // issued, not only on the throw.
  it('refuses, before any DDL, while any module has no course_modules row', async () => {
    mockDatabase({ column: 'nullable', orphans: 3 });

    await expect(migrateDropModuleRank()).rejects.toThrow(
      '3 modules have no course_modules row',
    );

    expect(statements().join('\n')).not.toContain('drop column');
  });

  it('verifies against information_schema after the drop and throws if the column survived', async () => {
    mockDatabase({ column: 'nullable', stillPresentAfterDrop: true });

    await expect(migrateDropModuleRank()).rejects.toThrow(
      'modules.rank still present after drop',
    );

    const all = statements();
    const dropIndex = all.findIndex((s) => s.includes('drop column'));
    const verifyIndex = all.findIndex((s) => s.includes(AFTER_DROP_PROBE));
    expect(dropIndex).toBeGreaterThanOrEqual(0);
    expect(verifyIndex).toBeGreaterThan(dropIndex);
  });
});
