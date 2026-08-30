// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock('#/db', () => ({ db }));

const { migrateDropLessonModuleId } = await import(
  '#/db/migrate-drop-lesson-module-id'
);

type Query = { queryChunks?: Array<{ value?: unknown }> };

/**
 * Flatten one executed statement (a drizzle `sql` template) into a single
 * lowercase, whitespace-collapsed string. Same house pattern as
 * `lesson-placements-migration.test.ts` — see that file's doc comment for
 * why `.value` has to be pulled out of each `StringChunk` by hand.
 */
function textOf(query: Query): string {
  return (query.queryChunks ?? [])
    .map((chunk) => (Array.isArray(chunk.value) ? chunk.value.join('') : ''))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Flatten every executed statement into one lowercase string per call. */
function statements(): string[] {
  return db.execute.mock.calls.map((c) => textOf(c[0] as Query));
}

const COLUMN_PROBE_QUERY = 'information_schema.columns';
const ORPHAN_COUNT_QUERY = 'left join "module_lessons"';

/**
 * Real driver shape: `drizzle-orm/node-postgres`'s `db.execute` resolves to
 * the raw pg `QueryResult` (`{ rows, rowCount, ... }`), never a bare array.
 * An earlier task in this build read `result[0]` instead of `rows[0]` and
 * silently always saw `undefined` — the gate never fired. Every test below
 * routes through this so the migration is only ever fed the shape the real
 * driver actually returns, for BOTH queries the migration reads a count
 * from: the `information_schema.columns` probe (does `module_id` still
 * exist?) and the orphan-count join.
 */
function mockExecute(
  opts: { columnExists?: boolean; orphanCount?: number } = {},
): void {
  const { columnExists = true, orphanCount = 0 } = opts;
  db.execute.mockImplementation((query: Query) => {
    const text = textOf(query);
    if (text.includes(COLUMN_PROBE_QUERY)) {
      return Promise.resolve({ rows: [{ n: columnExists ? 1 : 0 }] });
    }
    if (text.includes(ORPHAN_COUNT_QUERY)) {
      return Promise.resolve({ rows: [{ n: orphanCount }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

/** Same helper as before, now just `mockExecute` with `columnExists: true` (the default). */
function resolveOrphanCount(n: number): void {
  mockExecute({ orphanCount: n });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.execute.mockReset();
  db.transaction.mockReset();
  // Default: the transaction callback runs against `db` itself, so
  // `tx.execute(...)` inside the migration routes through the same
  // `db.execute` mock every other test in this file queues against.
  db.transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) =>
    fn(db),
  );
  resolveOrphanCount(0);
});

describe('migrateDropLessonModuleId', () => {
  it('verifies every lesson has a placement before dropping anything', async () => {
    await migrateDropLessonModuleId();
    const all = statements().join('\n');
    const check = all.indexOf('left join "module_lessons"');
    const drop = all.indexOf('drop column');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(check);
  });

  it('drops module_id, rank and lesson_dependencies, and creates the new GIN index', async () => {
    await migrateDropLessonModuleId();
    const all = statements().join('\n');
    expect(all).toContain('drop column if exists "module_id"');
    expect(all).toContain('drop column if exists "rank"');
    expect(all).toContain('drop table if exists "lesson_dependencies"');
    expect(all).toContain(
      'create index if not exists "module_lessons_depends_on_idx"',
    );
    expect(all).toContain('using gin ("depends_on")');
  });

  it('drops the old lesson_dependencies GIN index before dropping the table', async () => {
    await migrateDropLessonModuleId();
    const all = statements().join('\n');
    const dropIndex = all.indexOf(
      'drop index if exists "idx_lesson_dependencies_depends_on"',
    );
    const dropTable = all.indexOf('drop table if exists "lesson_dependencies"');
    expect(dropIndex).toBeGreaterThanOrEqual(0);
    expect(dropTable).toBeGreaterThan(dropIndex);
  });

  // Idempotency: every DDL statement uses IF EXISTS/IF NOT EXISTS, so a
  // second run against an already-migrated database is a no-op, not an
  // error. Mutant: drop the `if exists`/`if not exists` guard from any one
  // statement (e.g. `alter table "lessons" drop column "module_id"`) —
  // correct-shaped SQL (still a valid DDL statement, still runs clean the
  // FIRST time) but wrong-behaving on a re-run, which would throw
  // "column does not exist" / "relation does not exist" instead of no-op-ing.
  it('is idempotent — every statement guards with IF EXISTS or IF NOT EXISTS', async () => {
    await migrateDropLessonModuleId();
    const ddl = statements().filter(
      (s) =>
        s.includes('drop column') ||
        s.includes('drop table') ||
        s.includes('drop index') ||
        s.includes('create index'),
    );
    expect(ddl.length).toBeGreaterThan(0);
    for (const statement of ddl) {
      const guarded =
        statement.includes('if exists') || statement.includes('if not exists');
      expect(guarded).toBe(true);
    }
  });

  it('rejects and drops nothing when the orphan count comes back positive', async () => {
    resolveOrphanCount(3);

    let error: Error | undefined;
    try {
      await migrateDropLessonModuleId();
    } catch (e) {
      error = e as Error;
    }

    expect(error?.message).toContain('3 lesson(s) still have module_id');
    expect(error?.message).toContain('db:migrate-lesson-placements');
    // The gate actually stopped the migration, not just reported a message.
    // Mutant: read `(orphans as unknown as Array<{ n: number }>)[0]?.n`
    // straight off the `QueryResult` object `db.execute` really resolves
    // to (instead of `rows[0]?.n`) — correct-shaped (still compiles, still
    // reads SOME `.n`) but wrong-behaving: indexing a plain object with `[0]`
    // is always `undefined`, so the mutant's `n` is always `0` and this gate
    // never fires — it would proceed straight to dropping columns even with
    // orphans in the count. Verified RED against that exact mutant.
    expect(statements().join('\n')).not.toContain('drop column');
  });

  it('proceeds to drop when the orphan count comes back zero', async () => {
    resolveOrphanCount(0);

    await expect(migrateDropLessonModuleId()).resolves.toBeUndefined();
    expect(statements().join('\n')).toContain(
      'drop column if exists "module_id"',
    );
  });

  // Fix round 1, Critical 2: the orphan gate's own WHERE clause names
  // `l."module_id"` — a column that no longer exists after a first
  // successful run. Without probing first, a re-run (including recovery
  // from a partial failure) issues that query against a real database and
  // gets `column l.module_id does not exist`, exiting 1 forever. This test
  // proves the probe actually gates the query, not just that the migration
  // "still succeeds" (a mutant that always issues the orphan query but
  // tolerates its error would also "succeed" on a canned mock — asserting
  // the query was never ISSUED is what a canned-response mock CAN prove,
  // and is exactly what the real database needs to be true).
  //
  // Mutant: delete the `information_schema.columns` probe and its
  // `moduleIdStillExists` branch, always running the orphan-count query
  // unconditionally (the pre-fix-round-1 shape). Correct-shaped (still a
  // valid, syntactically fine query) but wrong-behaving the moment
  // `lessons.module_id` is actually gone. Verified RED: with that mutant,
  // `statements()` contains the orphan-count text even when `columnExists:
  // false`, failing the first assertion below.
  it('probes lessons.module_id first and skips the orphan gate entirely once it is already dropped (idempotent re-run)', async () => {
    mockExecute({ columnExists: false });

    await migrateDropLessonModuleId();

    const all = statements();
    expect(all.some((s) => s.includes(ORPHAN_COUNT_QUERY))).toBe(false);
    // The rest of the migration (unrelated to module_id) still runs even
    // when there's nothing left to drop on the lessons table — it's
    // independently idempotent.
    const joined = all.join('\n');
    expect(joined).toContain('drop table if exists "lesson_dependencies"');
    expect(joined).toContain(
      'create index if not exists "module_lessons_depends_on_idx"',
    );
    // And critically: no attempt to drop columns that are already gone.
    expect(joined).not.toContain('drop column');
  });

  it('still drops module_id/rank when the column probe reports it present (first run)', async () => {
    mockExecute({ columnExists: true, orphanCount: 0 });

    await migrateDropLessonModuleId();

    const all = statements();
    expect(all.some((s) => s.includes(ORPHAN_COUNT_QUERY))).toBe(true);
    expect(all.join('\n')).toContain('drop column if exists "module_id"');
  });

  // Fix round 1, Critical 2 (part 2): every statement must run inside ONE
  // `db.transaction`, since Postgres DDL is transactional and that's what
  // turns "failed partway between the column drops and the new index" into
  // a non-state instead of a half-migrated database a re-run then has to
  // reconcile. Mutant: drop the `db.transaction(...)` wrapper and call
  // `db.execute(...)` directly against the module-level `db` for every
  // statement (the pre-fix-round-1 shape) — correct-shaped (every statement
  // still runs, in the same order) but wrong-behaving: no atomicity across
  // the whole set. Verified RED against that mutant (`db.transaction` is
  // never called, and `db.execute` — the module-level mock, not `tx`'s — is
  // called directly instead of the distinct `tx` this test supplies).
  it('runs every statement inside db.transaction, never directly against the module-level db', async () => {
    const txExecute = vi.fn((query: Query) => {
      const text = textOf(query);
      if (text.includes(COLUMN_PROBE_QUERY)) {
        return Promise.resolve({ rows: [{ n: 1 }] });
      }
      if (text.includes(ORPHAN_COUNT_QUERY)) {
        return Promise.resolve({ rows: [{ n: 0 }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const tx = { execute: txExecute };
    db.transaction.mockImplementationOnce(
      async (fn: (t: typeof tx) => unknown) => fn(tx),
    );

    await migrateDropLessonModuleId();

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.execute).not.toHaveBeenCalled();
    expect(
      txExecute.mock.calls.some((c) =>
        textOf(c[0] as Query).includes('drop column if exists "module_id"'),
      ),
    ).toBe(true);
  });
});
