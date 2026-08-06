import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseOrgsTable,
  coursesTable,
  orgsTable,
  personaTable,
} from '#/db/schema';
import { getActiveOrgId } from '#/lib/active-org.server';

/**
 * Attach existing data to the active org, so personas can become org-scoped
 * without a hand-written migration.
 *
 * Run between two pushes, because `personas.org_id` is `notNull` and existing
 * rows have no value for it:
 *
 *   1. `pnpm db:push`  with `org_id` temporarily nullable
 *   2. `pnpm db:seed-org-links`
 *   3. `pnpm db:push`  with `org_id` back to notNull
 *
 * Idempotent throughout, so it is safe to re-run — and it is how a second
 * environment gets bootstrapped, not just this one.
 */
async function main() {
  const orgId = getActiveOrgId();

  const [org] = await db
    .select({ id: orgsTable.id, name: orgsTable.name })
    .from(orgsTable)
    .where(eq(orgsTable.id, orgId))
    .limit(1);
  if (!org) {
    throw new Error(
      `ACTIVE_ORG_ID=${orgId} does not exist in the organizations table.`,
    );
  }

  // 1. Personas with no org yet belong to the active one. Uses a raw isNull
  //    filter so re-runs never re-stamp a persona that has since been moved.
  //    Raw SQL for the predicate: the final schema types `org_id` as notNull,
  //    so `isNull(personaTable.orgId)` doesn't type-check — yet this backfill
  //    is exactly the step that makes notNull true.
  const adopted = await db
    .update(personaTable)
    .set({ orgId })
    .where(sql`${personaTable.orgId} is null`)
    .returning({ id: personaTable.id, name: personaTable.name });

  // 2. Every course joins the active org, so each one has a row to store a
  //    persona selection in.
  const courses = await db
    .select({ id: coursesTable.id, name: coursesTable.name })
    .from(coursesTable);
  for (const course of courses) {
    await db
      .insert(courseOrgsTable)
      .values({ courseId: course.id, orgId })
      .onConflictDoNothing({
        target: [courseOrgsTable.courseId, courseOrgsTable.orgId],
      });
  }

  // 3. Preserve today's behaviour exactly: before this change every chat
  //    resolved the "viper7" persona by name, regardless of course. Pinning it
  //    as both the org default and each course's explicit selection keeps that
  //    true on the first request after deploy.
  const [viper7] = await db
    .select({ id: personaTable.id })
    .from(personaTable)
    .where(eq(personaTable.orgId, orgId))
    .limit(1);

  if (viper7) {
    await db
      .update(personaTable)
      .set({ isOrgDefault: true })
      .where(eq(personaTable.id, viper7.id));

    // Only fills selections that are still empty — never overwrites a choice
    // an admin has since made in the AI-training modal.
    await db
      .update(courseOrgsTable)
      .set({ personaId: viper7.id })
      .where(
        and(
          eq(courseOrgsTable.orgId, orgId),
          isNull(courseOrgsTable.personaId),
        ),
      );
  }

  console.log(
    [
      `Active org: ${org.name} (id ${org.id})`,
      `Personas adopted: ${adopted.length}`,
      `Courses linked: ${courses.length}`,
      viper7
        ? `Default persona: id ${viper7.id}`
        : 'No persona found — default left unset',
    ].join('\n'),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
