import { describe, expect, it } from 'vitest';
import { resolveCourseOrgId } from './resolve-course-org-link';

/**
 * A fake `q` (the shape `newQ`/`txQ` in import-course.ts both satisfy) —
 * genuinely generic, matching `resolveCourseOrgId`'s own parameter type, so
 * it type-checks without a cast. Its two possible responses are configured
 * directly — no `pg.Pool` involved, per `resolve-course-org-link.ts`'s own
 * doc comment on why this logic was split out in the first place. Calls
 * are recorded manually (rather than via a `vi.fn()` spy, which can't stay
 * generic) into `calls`.
 */
function fakeQ(orgRows: Array<{ org_id: number }>) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const q = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    calls.push({ sql, params });
    if (sql.includes('select min(org_id)')) return orgRows as unknown as T[];
    return [] as T[]; // the insert…on conflict statement returns no rows
  };
  return { q, calls };
}

describe('resolveCourseOrgId', () => {
  it('links the course to the active org, then resolves via MIN(org_id)', async () => {
    const { q, calls } = fakeQ([{ org_id: 4 }]);

    const orgId = await resolveCourseOrgId(q, 42, 'itps-uas-remote', 4);

    expect(orgId).toBe(4);
    expect(calls[0].sql).toContain('insert into course_orgs');
    expect(calls[0].sql).toContain('on conflict (course_id, org_id) do nothing');
    expect(calls[0].params).toEqual([42, 4]);
    expect(calls[1].sql).toContain('select min(org_id)');
    expect(calls[1].params).toEqual([42]);
  });

  // The read-back is the point, not the active org passed in: a course that
  // already belonged to some OTHER (lower-id) org before this run must
  // resolve to THAT org, not necessarily the one just linked. Mutant:
  // return `activeOrgId` directly instead of reading `orgRow.org_id` back
  // — correct-shaped (still resolves to SOME org, still compiles) but
  // wrong-behaving the moment the course already had a lower org id.
  // Verified RED: with the MIN query resolving to a DIFFERENT org (2) than
  // the active one passed in (4), that mutant would still return 4.
  it('resolves to the MIN course_orgs row, not necessarily the active org just linked', async () => {
    const { q } = fakeQ([{ org_id: 2 }]);

    const orgId = await resolveCourseOrgId(q, 42, 'itps-uas-remote', 4);

    expect(orgId).toBe(2);
  });

  // Fix round 3: `scripts/import-course.ts`'s org resolution ran once,
  // before the lessons loop — this is that same gate, isolated. Mutant:
  // silently default to `activeOrgId` (or any other value) instead of
  // throwing when the read-back comes back empty — correct-shaped (still
  // returns a number) but wrong-behaving: it would let the caller proceed
  // to insert lessons with a GUESSED org rather than refusing. Verified RED
  // against that mutant (this test's `.rejects.toThrow` would see a
  // resolved promise instead).
  it('fails loudly, naming the course, when the course still has no course_orgs row', async () => {
    const { q, calls } = fakeQ([]); // read-back finds nothing

    await expect(
      resolveCourseOrgId(q, 42, 'itps-uas-remote', 4),
    ).rejects.toThrow(/itps-uas-remote.*id 42.*course_orgs/i);
    await expect(
      resolveCourseOrgId(q, 42, 'itps-uas-remote', 4),
    ).rejects.toThrow(/db:seed-org-links/);

    // Nothing beyond the link-attempt and the read-back was ever issued —
    // in particular, nothing that looks like a lesson insert. `main()`'s
    // sequential `await` means this same throw, uncaught here, is what
    // stops `import-course.ts` from ever reaching its lessons loop at all.
    expect(calls.every((c) => !c.sql.includes('insert into lessons'))).toBe(
      true,
    );
  });
});
