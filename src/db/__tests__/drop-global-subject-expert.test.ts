// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

const m = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock('#/db', () => ({
  db: {
    execute: m.execute,
    // Runs the callback against a tx whose `execute` is the same spy, so the
    // assertions below see the statements the migration actually issued.
    transaction: (fn: (tx: { execute: typeof m.execute }) => unknown) =>
      fn({ execute: m.execute }),
  },
}));

const { migrateDropGlobalSubjectExpert } = await import(
  '#/db/migrate-drop-global-subject-expert'
);

/**
 * Every statement issued, rendered to its exact PARAMETERIZED text plus its
 * bound params — the house pattern from `render-sql.ts`.
 *
 * The first version of this helper walked `queryChunks` and joined
 * `chunk.value`, which silently dropped every interpolated value. The role
 * name is interpolated, so `expect(del).toContain('r."name" =')` asserted
 * nothing about WHICH role was deleted: a mutant changing
 * `${SUBJECT_EXPERT_ROLE}` to `${'admin'}` passed all five tests, on the one
 * migration on this branch that deletes rows. `render-sql.ts`'s own doc
 * comment warns about precisely this class of extractor; it should have been
 * used from the start.
 */
const statements = () =>
  m.execute.mock.calls.map((call) => ({
    sql: renderSql(call[0] as SQL)
      .replace(/\s+/g, ' ')
      .trim(),
    params: renderSqlParams(call[0] as SQL),
  }));

const AFFECTED = [
  { email: 'sme@example.com', user_id: 'u1', discipline_count: 2 },
  { email: 'stranded@example.com', user_id: 'u2', discipline_count: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('migrateDropGlobalSubjectExpert', () => {
  it('changes nothing on a dry run, however many rows it found', async () => {
    m.execute.mockResolvedValueOnce({ rows: AFFECTED });

    const result = await migrateDropGlobalSubjectExpert(false);

    // The default must be inert. Mutant this catches: the `apply` flag read
    // the wrong way round, or ignored — which on the real database is an
    // unasked-for delete the operator ran expecting a report.
    expect(result.deleted).toBe(0);
    expect(statements().some((s) => s.sql.startsWith('delete'))).toBe(false);
    expect(m.execute).toHaveBeenCalledTimes(1);
  });

  it('deletes only through the subject-expert role when applied', async () => {
    m.execute
      .mockResolvedValueOnce({ rows: AFFECTED })
      .mockResolvedValueOnce({ rowCount: 2 });

    const result = await migrateDropGlobalSubjectExpert(true);

    expect(result.deleted).toBe(2);
    const del = statements().find((s) => s.sql.startsWith('delete'));
    // Joined to `user_roles` and filtered by name, so it cannot take every
    // role row with it. Two mutants matter and BOTH are covered:
    //   - `delete from user_profile_roles` with no join, which would strip
    //     every admin and owner in the org and still report success;
    //   - the same statement filtering on a DIFFERENT role name, which the
    //     old param-blind extractor could not see at all.
    expect(del?.sql).toBe(
      'delete from "user_profile_roles" upr using "user_roles" r ' +
        'where r."id" = upr."role_id" and r."name" = $1;',
    );
    // The bound value is the whole point: this is what says the migration
    // deletes SUBJECT EXPERTS and not administrators.
    expect(del?.params).toEqual(['subject-expert']);
  });

  it('never deletes the role itself', async () => {
    m.execute
      .mockResolvedValueOnce({ rows: AFFECTED })
      .mockResolvedValueOnce({ rowCount: 2 });

    await migrateDropGlobalSubjectExpert(true);

    // `role_permissions` for `subject-expert` is what a `discipline_staff`
    // row resolves THROUGH. Deleting the role would take every real subject
    // expert's authority with it — the one genuinely destructive thing this
    // migration must not do.
    for (const statement of statements()) {
      expect(statement.sql).not.toContain('delete from "user_roles"');
      expect(statement.sql).not.toContain('delete from "role_permissions"');
    }
  });

  it('does no work at all when there is nothing to clean up', async () => {
    m.execute.mockResolvedValueOnce({ rows: [] });

    const result = await migrateDropGlobalSubjectExpert(true);

    // Re-running after a successful pass must be a no-op, not a second
    // delete issued against an empty set.
    expect(result).toEqual({ affected: [], deleted: 0 });
    expect(m.execute).toHaveBeenCalledTimes(1);
  });

  it('reports who would be left with no disciplines at all', async () => {
    m.execute.mockResolvedValueOnce({ rows: AFFECTED });

    const result = await migrateDropGlobalSubjectExpert(false);

    // The count is the reason the dry run exists: someone holding
    // disciplines loses nothing, someone holding none becomes a plain user.
    // A report that omitted the count would hide the only case needing
    // follow-up.
    expect(
      result.affected.find((row) => row.email === 'stranded@example.com')
        ?.discipline_count,
    ).toBe(0);
  });
});
