/**
 * Insert-or-confirm a course's `course_orgs` link to the active org, then
 * resolve the org id to stamp on its lessons via the same MIN(org_id) rule
 * `migrate-lesson-placements.ts`'s backfill used — reading it back rather
 * than trusting `activeOrgId` directly means a course that already
 * belonged to some OTHER (lower-id) org before this run resolves to THAT
 * org, exactly like a backfilled lesson would.
 *
 * Split out of `import-course.ts` itself (which constructs live `pg.Pool`s
 * and runs its `main()` unconditionally at import time — importing that
 * file directly in a test would attempt a real database connection) so
 * this one piece of logic can be unit-tested with a fake `q`, no `pg`
 * involved.
 *
 * Throws — naming the course, before the caller can do anything else with
 * the result — if the course still has no `course_orgs` row after the
 * insert-or-confirm above. In practice this should be unreachable (the
 * insert above guarantees a row), but it is cheap insurance against that
 * insert silently not landing, and its wording matches
 * `migrate-lesson-placements.ts`'s own gate so an operator hitting either
 * sees one consistent instruction.
 */
export async function resolveCourseOrgId(
  q: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<T[]>,
  courseId: number,
  courseSlug: string,
  activeOrgId: number,
): Promise<number> {
  await q(
    `insert into course_orgs (course_id, org_id) values ($1, $2)
       on conflict (course_id, org_id) do nothing`,
    [courseId, activeOrgId],
  );

  const [orgRow] = await q<{ org_id: number }>(
    `select min(org_id)::int as org_id from course_orgs where course_id = $1`,
    [courseId],
  );
  const orgId = orgRow?.org_id ?? null;
  if (orgId === null) {
    throw new Error(
      `Course "${courseSlug}" (id ${courseId}) has no course_orgs row. ` +
        `Seed those links (pnpm db:seed-org-links) and re-run.`,
    );
  }
  return orgId;
}
