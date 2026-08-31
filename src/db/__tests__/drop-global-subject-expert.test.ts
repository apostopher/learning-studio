// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

/** Every SQL string issued, whitespace collapsed so it can be matched on. */
const statements = () =>
  m.execute.mock.calls.map((call) => {
    const chunks = (call[0]?.queryChunks ?? []) as { value?: string[] }[];
    return chunks
      .map((chunk) => (chunk.value ?? []).join(''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  });

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
    expect(statements().some((s) => s.startsWith('delete'))).toBe(false);
    expect(m.execute).toHaveBeenCalledTimes(1);
  });

  it('deletes only through the subject-expert role when applied', async () => {
    m.execute
      .mockResolvedValueOnce({ rows: AFFECTED })
      .mockResolvedValueOnce({ rowCount: 2 });

    const result = await migrateDropGlobalSubjectExpert(true);

    expect(result.deleted).toBe(2);
    const del = statements().find((s) => s.startsWith('delete'));
    // Joined to `user_roles` and filtered by name, so it cannot take every
    // role row with it. A `delete from user_profile_roles` with no join is
    // the mutant that matters here — it would strip every admin and owner in
    // the org and the migration would still report success.
    expect(del).toContain('delete from "user_profile_roles"');
    expect(del).toContain('using "user_roles"');
    expect(del).toContain('r."name" =');
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
      expect(statement).not.toContain('delete from "user_roles"');
      expect(statement).not.toContain('delete from "role_permissions"');
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
