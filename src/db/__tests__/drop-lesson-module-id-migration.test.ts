// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
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

const ORPHAN_COUNT_QUERY = 'left join "module_lessons"';

/**
 * Real driver shape: `drizzle-orm/node-postgres`'s `db.execute` resolves to
 * the raw pg `QueryResult` (`{ rows, rowCount, ... }`), never a bare array.
 * An earlier task in this build read `result[0]` instead of `rows[0]` and
 * silently always saw `undefined` — the gate never fired. Every test below
 * that needs a specific orphan count goes through this helper so the
 * migration is only ever fed the shape the real driver actually returns.
 */
function resolveOrphanCount(n: number): void {
  db.execute.mockImplementation((query: Query) =>
    Promise.resolve(
      textOf(query).includes(ORPHAN_COUNT_QUERY)
        ? { rows: [{ n }] }
        : { rows: [] },
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.execute.mockReset();
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
});
