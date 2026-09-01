import { describe, expect, it, vi } from 'vitest';
import { resolveCourseOrgId } from './resolve-course-org-link';

/**
 * A fake `q` (the shape `newQ`/`txQ` in import-course.ts both satisfy) —
 * genuinely generic, matching `resolveCourseOrgId`'s own parameter type, so
 * it type-checks without a cast. Its three possible responses are
 * configured directly — no `pg.Pool` involved, per
 * `resolve-course-org-link.ts`'s own doc comment on why this logic was
 * split out in the first place. Calls are recorded manually (rather than
 * via a `vi.fn()` spy, which can't stay generic) into `calls`.
 */
function fakeQ(opts: {
  existingOrgIds?: number[];
  resolvedOrgId?: number | null;
}) {
  const { existingOrgIds = [], resolvedOrgId = null } = opts;
  const calls: { sql: string; params: unknown[] }[] = [];
  const q = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    calls.push({ sql, params });
    if (sql.includes('select org_id from course_orgs')) {
      return existingOrgIds.map((org_id) => ({ org_id })) as unknown as T[];
    }
    if (sql.includes('select min(org_id)')) {
      return (
        resolvedOrgId === null ? [] : [{ org_id: resolvedOrgId }]
      ) as unknown as T[];
    }
    return [] as T[]; // the insert … on conflict statement
  };
  return { q, calls };
}

describe('resolveCourseOrgId', () => {
  it('reads existing links, then links the course to the active org, then resolves via MIN(org_id)', async () => {
    const { q, calls } = fakeQ({ existingOrgIds: [], resolvedOrgId: 4 });

    const orgId = await resolveCourseOrgId(q, 42, 'itps-uas-remote', 4);

    expect(orgId).toBe(4);
    expect(calls[0].sql).toContain('select org_id from course_orgs');
    expect(calls[0].params).toEqual([42]);
    expect(calls[1].sql).toContain('insert into course_orgs');
    expect(calls[1].sql).toContain('on conflict (course_id, org_id) do nothing');
    expect(calls[1].params).toEqual([42, 4]);
    expect(calls[2].sql).toContain('select min(org_id)');
    expect(calls[2].params).toEqual([42]);
  });

  // The read-back is the point, not the active org passed in: a course that
  // already belongs to some OTHER (lower-id) org — with the active org
  // ALSO already among its links, so no refusal — must resolve to the
  // LOWEST org id, not necessarily the active one. Mutant: return
  // `activeOrgId` directly instead of reading `orgRow.org_id` back —
  // correct-shaped (still resolves to SOME org, still compiles) but
  // wrong-behaving the moment the course already had a lower org id.
  // Verified RED: with the MIN query resolving to a DIFFERENT org (2) than
  // the active one passed in (4), that mutant would still return 4.
  it('resolves to the MIN course_orgs row, not necessarily the active org just linked', async () => {
    const { q } = fakeQ({ existingOrgIds: [2, 4], resolvedOrgId: 2 });

    const orgId = await resolveCourseOrgId(q, 42, 'itps-uas-remote', 4);

    expect(orgId).toBe(2);
  });

  // Fix round 5, Minor 3: `resolveCourseOrgId` used to log only
  // `activeOrgId` ("linked to org 4") even when the MIN it actually
  // returns (and stamps on every lesson) is a DIFFERENT, lower org — the
  // log would then say "org 4" while every row gets org 2. Mutant: log
  // only `activeOrgId`, dropping the resolved `orgId` from the message —
  // correct-shaped (still logs something plausible-sounding) but
  // wrong-behaving the moment they differ. Verified RED: with existing
  // links `[2, 4]` and active org `4`, the resolved value is `2`, and this
  // test's assertion that "2" appears in the log fails against that
  // mutant.
  it('logs the resolved MIN — the value actually stamped on lessons — not just the active org', async () => {
    const { q } = fakeQ({ existingOrgIds: [2, 4], resolvedOrgId: 2 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await resolveCourseOrgId(q, 42, 'itps-uas-remote', 4);

    const logged = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    // Precise substrings, not bare digits — `courseId` (42) itself contains
    // a "2", so a bare `toContain('2')` would pass even against the mutant
    // that never logs the resolved MIN at all.
    expect(logged).toContain('linked to active org 4');
    expect(logged).toContain('stamped with org 2');

    logSpy.mockRestore();
  });

  // Fix round 4, Important 2: the hazard this test exists to catch. If the
  // course already belongs to some OTHER org and the active org is NOT
  // among its existing links, inserting anyway would silently LOWER (or
  // otherwise change) what MIN(org_id) resolves to for every lesson this
  // import writes from here on — a permanently mixed-org lesson set inside
  // one course, with nothing logged. Mutant: skip the existing-links read
  // entirely and always insert unconditionally (the pre-fix-round-4
  // shape) — correct-shaped (still a valid, idempotent upsert) but
  // wrong-behaving the instant `ACTIVE_ORG_ID` disagrees with a course's
  // real org. Verified RED: with that mutant, the "insert into
  // course_orgs" call happens unconditionally instead of never.
  it('refuses, naming the course/current orgs/active org, when the course already belongs to a different org', async () => {
    const { q, calls } = fakeQ({ existingOrgIds: [2] });

    await expect(
      resolveCourseOrgId(q, 42, 'itps-uas-remote', 4),
    ).rejects.toThrow(/itps-uas-remote.*id 42.*\[2\].*active org.*\(4\)/is);

    // Refused BEFORE any write — no insert (linking, or changing which org
    // owns this course) was ever attempted.
    expect(calls.some((c) => c.sql.includes('insert into course_orgs'))).toBe(
      false,
    );
  });

  it('proceeds without refusing when the active org is already among the existing links', async () => {
    const { q, calls } = fakeQ({ existingOrgIds: [2, 4], resolvedOrgId: 2 });

    await expect(
      resolveCourseOrgId(q, 42, 'itps-uas-remote', 4),
    ).resolves.toBe(2);
    expect(calls.some((c) => c.sql.includes('insert into course_orgs'))).toBe(
      true,
    );
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
    const { q } = fakeQ({ existingOrgIds: [], resolvedOrgId: null });

    await expect(
      resolveCourseOrgId(q, 42, 'itps-uas-remote', 4),
    ).rejects.toThrow(/itps-uas-remote.*id 42.*course_orgs/i);
    await expect(
      resolveCourseOrgId(q, 42, 'itps-uas-remote', 4),
    ).rejects.toThrow(/db:seed-org-links/);
  });
});
