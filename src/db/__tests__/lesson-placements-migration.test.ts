// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('#/db', () => ({
  db: {
    execute: db.execute,
    /**
     * The whole migration runs inside one transaction now, so a failure
     * part-way rolls the run back instead of leaving the database
     * half-expanded. The stub runs the callback against a `tx` whose
     * `execute` is the same spy, so every assertion below still sees the
     * statements the migration actually issued — and the NOT NULL gate still
     * throws through it.
     */
    transaction: (fn: (tx: { execute: typeof db.execute }) => unknown) =>
      fn({ execute: db.execute }),
  },
}));

const { migrateLessonPlacements } = await import(
  '#/db/migrate-lesson-placements'
);

type Query = { queryChunks?: Array<{ value?: unknown }> };

/**
 * Flatten one executed statement (a drizzle `sql` template) into a single
 * lowercase, whitespace-collapsed string.
 *
 * A drizzle `sql` template's `queryChunks` holds `StringChunk` wrapper objects
 * (each a `{ value: string[] }`), not plain strings — `.join()` on the array
 * itself would stringify each wrapper to "[object Object]". None of this
 * migration's statements interpolate `${}` bound params, so every chunk here
 * is a `StringChunk`; pulling `.value` out of each is what makes the text
 * actually readable.
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

const ORPHAN_COUNT_QUERY =
  'select count(*)::int as "n" from "lessons" where "org_id" is null';

/**
 * Real driver shape: `drizzle-orm/node-postgres`'s `db.execute` resolves to
 * the raw pg `QueryResult` (`{ rows, rowCount, ... }`), never a bare array.
 * `resolveOrphanCount` lets a test answer just the one query the migration
 * actually reads a result from; every other statement gets an empty result
 * set, which is all the migration ever needs from them.
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
  db.execute.mockResolvedValue({ rows: [] });
});

describe('migrateLessonPlacements', () => {
  it('creates module_lessons before backfilling it', async () => {
    await migrateLessonPlacements();
    const all = statements().join('\n');
    const create = all.indexOf('create table if not exists "module_lessons"');
    const insert = all.indexOf('insert into "module_lessons"');
    expect(create).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(create);
  });

  it('backfills exactly one placement per existing lesson, carrying rank', async () => {
    await migrateLessonPlacements();
    const insert = statements().find((s) =>
      s.includes('insert into "module_lessons"'),
    );
    expect(insert).toContain('select "module_id", "id", "rank" from "lessons"');
    // Idempotent: re-running must not double-insert.
    expect(insert).toContain('on conflict');
  });

  it('skips lessons with no module, so a re-run cannot abort', async () => {
    db.execute.mockResolvedValue({ rows: [{ n: 0 }] });

    await migrateLessonPlacements();

    const backfill = statements().find((sql) =>
      sql.includes('insert into "module_lessons"'),
    );
    // `migrate-drop-lesson-module-id.ts` instructs a re-run of this migration
    // as its remediation, and by then the app is deployed — so
    // `createLibraryLesson` has been writing lessons with a NULL `module_id`
    // (it creates no placement by design). Selected unfiltered they violate
    // `module_lessons.module_id NOT NULL`; the statement aborts with a 23502
    // and `on conflict` cannot catch it, since that only covers a unique
    // violation.
    //
    // Mutant this catches: the WHERE dropped as redundant — every existing
    // lesson has a module today, so it looks like a no-op right up until the
    // moment the remediation is actually needed.
    expect(backfill).toContain('is not null');
  });

  it('carries dependsOn across from lesson_dependencies', async () => {
    await migrateLessonPlacements();
    const all = statements().join('\n');
    expect(all).toContain('from "lesson_dependencies"');
    expect(all).toContain('"depends_on"');
  });

  it('refuses to set org_id NOT NULL while any lesson lacks an org', async () => {
    await migrateLessonPlacements();
    const all = statements().join('\n');
    const guard = all.indexOf('where "org_id" is null');
    const notNull = all.indexOf('set not null');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(notNull).toBeGreaterThan(guard);
  });

  it('does not drop lessons.module_id — that is the contract migration', async () => {
    await migrateLessonPlacements();
    expect(statements().join('\n')).not.toContain('drop column "module_id"');
  });

  it('creates disciplines before indexing lessons.discipline_id', async () => {
    await migrateLessonPlacements();
    const all = statements().join('\n');
    const createDisciplines = all.indexOf(
      'create table if not exists "disciplines"',
    );
    const createIndex = all.indexOf(
      'create index if not exists "lessons_discipline_id_idx"',
    );
    expect(createDisciplines).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(createDisciplines);
  });

  it('rejects and never sets NOT NULL when the orphan count comes back positive', async () => {
    resolveOrphanCount(3);

    let error: Error | undefined;
    try {
      await migrateLessonPlacements();
    } catch (e) {
      error = e as Error;
    }

    expect(error?.message).toContain('3 lesson(s) have no org');
    expect(error?.message).toContain('db:seed-org-links');
    // The gate actually stopped the migration, not just reported a message.
    expect(statements().join('\n')).not.toContain('set not null');
  });

  it('proceeds to set org_id NOT NULL when the orphan count comes back zero', async () => {
    resolveOrphanCount(0);

    await expect(migrateLessonPlacements()).resolves.toBeUndefined();
    expect(statements().join('\n')).toContain('set not null');
  });
});
