/**
 * Link a course's `course_orgs` row to the active org — REFUSING rather
 * than silently changing course ownership if it already belongs to some
 * OTHER org — then resolve the org id to stamp on its lessons via the same
 * MIN(org_id) rule `migrate-lesson-placements.ts`'s backfill used.
 *
 * Fix round 4, Important 2: an earlier version of this function inserted
 * the active org's link unconditionally and always trusted the resulting
 * MIN() to "just work". That is true only when the active org's id is
 * HIGHER than every org the course already belongs to. If `ACTIVE_ORG_ID`
 * is LOWER, the insert changes what MIN(org_id) resolves to: newly
 * imported lessons would get stamped with the active org while the
 * course's pre-existing (backfilled) lessons keep the real one — a
 * permanently mixed-org lesson set inside one course, silently, with
 * nothing logged. Given this repo's history with stale exported env values
 * silently shadowing config (see memory: theme-env-shadowing), a wrong
 * `ACTIVE_ORG_ID` reaching this function is a live hazard, not a
 * theoretical one.
 *
 * So: read the course's existing `course_orgs` rows FIRST. If any exist and
 * the active org is not already one of them, refuse — naming the course,
 * its current org ids, and the active org id. Only once that's clear
 * (no rows yet, or the active org is already linked) does the insert run,
 * and it logs which org id ended up linked.
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
 * insert above guarantees a row once the conflict check has passed), but
 * it is cheap insurance, and its wording matches
 * `migrate-lesson-placements.ts`'s own gate so an operator hitting either
 * sees one consistent instruction (fix round 4, Minor 6).
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
  const existingLinks = await q<{ org_id: number }>(
    `select org_id from course_orgs where course_id = $1 order by org_id`,
    [courseId],
  );
  const existingOrgIds = existingLinks.map((r) => r.org_id);

  if (existingOrgIds.length > 0 && !existingOrgIds.includes(activeOrgId)) {
    throw new Error(
      `Course "${courseSlug}" (id ${courseId}) already belongs to org(s) ` +
        `[${existingOrgIds.join(', ')}], which does NOT include the active ` +
        `org (${activeOrgId}). Linking it here would silently change which ` +
        `org MIN(org_id) resolves to for every lesson this import writes — ` +
        `refusing rather than changing course ownership silently. If org ` +
        `${activeOrgId} really should also own this course, link it ` +
        `explicitly (pnpm db:seed-org-links) and re-run.`,
    );
  }

  // Either this course has no course_orgs row yet, or the active org is
  // already one of them — safe to insert-or-confirm without changing
  // which org MIN(org_id) resolves to.
  await q(
    `insert into course_orgs (course_id, org_id) values ($1, $2)
       on conflict (course_id, org_id) do nothing`,
    [courseId, activeOrgId],
  );
  console.log(
    `    course "${courseSlug}" (id ${courseId}) linked to org ${activeOrgId}`,
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
