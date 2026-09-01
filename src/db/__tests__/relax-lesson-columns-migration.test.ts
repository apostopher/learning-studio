// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('#/db', () => ({ db }));

const { migrateRelaxLessonColumns } = await import(
  '#/db/migrate-relax-lesson-columns'
);

type Query = { queryChunks?: Array<{ value?: unknown }> };

/**
 * Flatten one executed statement into a single lowercase, whitespace-
 * collapsed string. Same house pattern as the sibling contract migration's
 * test — see `drop-lesson-module-id-migration.test.ts`'s doc comment for
 * why `.value` has to be pulled out of each `StringChunk` by hand.
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

// Matches the migration's ACTUAL probe predicate — fix round 4, Minor 7
// switched this from `information_schema.columns where table_schema =
// 'public'` to `to_regclass('lessons')` + `pg_attribute`, resolving the
// same unqualified name the sibling DDL (`alter table "lessons" ...`) does,
// through `search_path`, rather than hardcoding a schema the DDL never
// names. A mutant that probed the wrong table/column, or reverted to the
// schema-hardcoded form, would not be "recognized" here and would fall
// through to the empty-rows default, which every test below can detect.
const COLUMN_PROBE_QUERY =
  "attrelid = to_regclass('lessons') and attname in ('module_id', 'rank') and not attisdropped";

/** Which of `module_id`/`rank` the probe reports still present. */
function resolvePresentColumns(present: Array<'module_id' | 'rank'>): void {
  db.execute.mockImplementation((query: Query) => {
    const text = textOf(query);
    if (text.includes(COLUMN_PROBE_QUERY)) {
      return Promise.resolve({
        rows: present.map((column_name) => ({ column_name })),
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.execute.mockReset();
  resolvePresentColumns(['module_id', 'rank']);
});

describe('migrateRelaxLessonColumns', () => {
  it('relaxes both module_id and rank when both are still present (first run)', async () => {
    resolvePresentColumns(['module_id', 'rank']);

    await migrateRelaxLessonColumns();

    const all = statements().join('\n');
    expect(all).toContain(
      'alter table "lessons" alter column "module_id" drop not null',
    );
    expect(all).toContain(
      'alter table "lessons" alter column "rank" drop not null',
    );
  });

  // Fix round 2, Critical 2: `alter column ... drop not null` has no
  // `if exists`-style guard — the column must exist or Postgres raises
  // `column does not exist`. This is the case a mutant that always issues
  // both ALTERs unconditionally would get wrong the moment ONE of the two
  // columns has already been dropped (e.g. a partially-completed prior
  // migration run, or re-running after the contract migration touched only
  // one column somehow). Verified RED against that mutant: with `rank`
  // absent from the probe result, the mutant still emits an ALTER for
  // `rank`, failing the second assertion below.
  it('relaxes only the column the probe reports present, per column', async () => {
    resolvePresentColumns(['module_id']); // rank already gone somehow

    await migrateRelaxLessonColumns();

    const all = statements().join('\n');
    expect(all).toContain(
      'alter table "lessons" alter column "module_id" drop not null',
    );
    expect(all).not.toContain('alter column "rank"');
  });

  it('relaxes only rank when module_id is the one already gone', async () => {
    resolvePresentColumns(['rank']);

    await migrateRelaxLessonColumns();

    const all = statements().join('\n');
    expect(all).not.toContain('alter column "module_id"');
    expect(all).toContain(
      'alter table "lessons" alter column "rank" drop not null',
    );
  });

  // Idempotent past the point the contract migration has already dropped
  // both columns entirely (the doc's actual precondition, fix round 2,
  // Critical 2's second half — the old doc claimed this unconditionally,
  // which was true only until the contract migration ran). Mutant: skip
  // the probe and always emit both ALTERs — correct-shaped SQL, but
  // wrong-behaving (and un-runnable) once both columns are gone. Verified
  // RED: with an empty probe result, that mutant still emits both ALTER
  // statements, failing the assertion below.
  it('is a no-op once both columns are already dropped by the contract migration', async () => {
    resolvePresentColumns([]);

    await expect(migrateRelaxLessonColumns()).resolves.toBeUndefined();

    const all = statements().join('\n');
    expect(all).not.toContain('alter column');
  });

  it('probes before altering anything (ordering)', async () => {
    resolvePresentColumns(['module_id', 'rank']);

    await migrateRelaxLessonColumns();

    const all = statements();
    const probeIndex = all.findIndex((s) => s.includes(COLUMN_PROBE_QUERY));
    const alterIndex = all.findIndex((s) => s.includes('drop not null'));
    expect(probeIndex).toBeGreaterThanOrEqual(0);
    expect(alterIndex).toBeGreaterThan(probeIndex);
  });
});
