// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock('#/db', () => ({ db }));

const { migrateDisciplineModules } = await import(
  '#/db/migrate-discipline-modules'
);

type Query = { queryChunks?: Array<{ value?: unknown }> };

/** Same house pattern as migrate-course-remixes.test.ts. */
function textOf(query: Query): string {
  return (query.queryChunks ?? [])
    .map((chunk) => (Array.isArray(chunk.value) ? chunk.value.join('') : ''))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

beforeEach(() => vi.clearAllMocks());

describe('migrateDisciplineModules', () => {
  it('no-ops when discipline_modules already exists, without opening a transaction', async () => {
    db.execute.mockResolvedValueOnce({ rows: [{ exists: true }] });
    expect(await migrateDisciplineModules()).toBe('exists');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  /**
   * The two `on delete` clauses ARE the no-data-loss guarantee: a deleted
   * module sets its lessons' column to null (they return to Untitled); a
   * deleted discipline takes its (already empty — deleteDiscipline refuses
   * while lessons remain) modules with it. Pinned as exact text. Both new
   * lesson columns are nullable and have no default: no row is rewritten.
   */
  it('creates the table and the two nullable lesson columns in one transaction, with SET NULL on the lesson side', async () => {
    db.execute.mockResolvedValueOnce({ rows: [{ exists: false }] });
    const executed: string[] = [];
    db.transaction.mockImplementation(
      async (
        fn: (tx: { execute: (q: Query) => Promise<unknown> }) => Promise<void>,
      ) => {
        await fn({
          execute: async (q) => {
            executed.push(textOf(q));
            return { rows: [] };
          },
        });
      },
    );

    expect(await migrateDisciplineModules()).toBe('created');
    expect(executed[0]).toBe(
      'create table "discipline_modules" ( "id" integer primary key generated always as identity, "discipline_id" integer not null references "disciplines"("id") on delete cascade, "name" text not null, "rank" numeric(30,15) not null, "created_at" timestamp not null default now(), "updated_at" timestamp not null default now() )',
    );
    expect(executed[1]).toBe(
      'create index "discipline_modules_discipline_id_idx" on "discipline_modules" ("discipline_id")',
    );
    expect(executed[2]).toBe(
      'alter table "lessons" add column if not exists "discipline_module_id" integer references "discipline_modules"("id") on delete set null',
    );
    expect(executed[3]).toBe(
      'alter table "lessons" add column if not exists "library_rank" numeric(30,15)',
    );
    expect(executed[4]).toBe(
      'create index if not exists "lessons_discipline_module_id_idx" on "lessons" ("discipline_module_id")',
    );
    expect(executed).toHaveLength(5);
    // Nothing that could touch a row.
    for (const statement of executed) {
      expect(statement).not.toMatch(/^(update|delete|insert)/);
    }
  });
});
