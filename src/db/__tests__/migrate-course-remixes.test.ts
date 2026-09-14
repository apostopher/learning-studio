// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock('#/db', () => ({ db }));

const { migrateCourseRemixes } = await import('#/db/migrate-course-remixes');

type Query = { queryChunks?: Array<{ value?: unknown }> };

/** Same house pattern as migrate-drop-module-rank.test.ts. */
function textOf(query: Query): string {
  return (query.queryChunks ?? [])
    .map((chunk) => (Array.isArray(chunk.value) ? chunk.value.join('') : ''))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('migrateCourseRemixes', () => {
  it('no-ops when course_remixes already exists, without opening a transaction', async () => {
    db.execute.mockResolvedValueOnce({ rows: [{ exists: true }] });
    const outcome = await migrateCourseRemixes();
    expect(outcome).toBe('exists');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('creates the table with RESTRICT on the source and CASCADE on the remixer, inside one transaction', async () => {
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

    const outcome = await migrateCourseRemixes();

    expect(outcome).toBe('created');
    // Statement 0 is the table. Pinned as exact text: the two `on delete`
    // clauses are the whole reason this table is hand-written rather than
    // generated, and `restrict` vs `cascade` on the wrong column is the bug
    // the spec calls out (a deleted source silently emptying every remixer).
    expect(executed[0]).toBe(
      'create table "course_remixes" ( "id" integer primary key generated always as identity, "course_id" integer not null references "courses"("id") on delete cascade, "source_course_id" integer not null references "courses"("id") on delete restrict, "created_by" varchar(255), "created_at" timestamp not null default now() )',
    );
    expect(executed[1]).toBe(
      'create unique index "course_remixes_course_source_idx" on "course_remixes" ("course_id", "source_course_id")',
    );
    expect(executed[2]).toBe(
      'create index "course_remixes_source_course_id_idx" on "course_remixes" ("source_course_id")',
    );
    expect(executed).toHaveLength(3);
  });
});
