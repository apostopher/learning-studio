// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { modulesTable } from '../schema';

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

describe('migrate-drop-module-rank module', () => {
  /**
   * The migration guards `main()` on `process.argv[1]` (house pattern from
   * migrate-course-modules.ts) so importing the file never touches the
   * database. Asserted on the collaborator — `db.execute` — not on "it
   * didn't throw": an unguarded top-level `await main()` would run the
   * `information_schema` probe (and, on a real connection, the DROP) the
   * moment anything imported it.
   */
  it('does not run the migration on import', async () => {
    const db = { execute: vi.fn(), transaction: vi.fn() };
    vi.doMock('#/db', () => ({ db }));

    await import('#/db/migrate-drop-module-rank');

    expect(db.execute).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
