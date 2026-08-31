/**
 * Remove `subject-expert` rows from `user_profile_roles`.
 *
 * A subject expert's authority comes from the discipline they were appointed
 * to. The role was assignable globally until `SCOPE_ONLY_ROLES` landed, and a
 * global row unioned into `requireScopedPermission` — handing that person
 * `content:*` over every discipline AND `structure:*` over every course at
 * once, which is the opposite of "expert of this subject".
 *
 * Those rows are already INERT: the guard filters scope-only roles out of the
 * global list, so nothing reads them any more. This migration is therefore
 * tidying, not a fix — which is exactly why it is worth doing carefully rather
 * than quickly. A table carrying rows that mean nothing is a table the next
 * reader will draw a wrong conclusion from.
 *
 * **Dry run by default.** It prints who is affected and changes nothing;
 * `--apply` commits. That default is not ceremony: for anyone holding the
 * global role and NO `discipline_staff` row, deleting it is the moment they
 * stop being staff at all. The report names them so they can be appointed to
 * the disciplines they actually cover — before the row that was standing in
 * for that is gone.
 *
 * Safe to re-run. The delete is keyed on a join that finds nothing the second
 * time, and the whole thing is one transaction.
 *
 * Run: pnpm db:drop-global-subject-expert          (report only)
 *      pnpm db:drop-global-subject-expert --apply  (commit)
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';
import { SUBJECT_EXPERT_ROLE } from '#/lib/admin-schemas';

/**
 * Snake-cased and index-signed because it is a raw `db.execute` row, not a
 * query-builder result — drizzle types those as `Record<string, unknown>`.
 */
interface AffectedRow extends Record<string, unknown> {
  email: string;
  user_id: string;
  discipline_count: number;
}

export async function migrateDropGlobalSubjectExpert(
  apply: boolean,
): Promise<{ affected: AffectedRow[]; deleted: number }> {
  return db.transaction(async (tx) => {
    /**
     * Everyone holding the global role, with how many disciplines they
     * actually hold.
     *
     * The count is the whole point of the report: someone with disciplines
     * loses nothing they were using, while someone with zero is about to
     * become a plain user, and those two need different follow-up from the
     * operator. Reporting a bare list would hide that difference.
     */
    const { rows: affected } = await tx.execute<AffectedRow>(sql`
      select
        p."email"          as "email",
        p."user_id"        as "user_id",
        count(ds."id")::int as "discipline_count"
      from "user_profile_roles" upr
      join "user_roles" r on r."id" = upr."role_id"
      join "user_profiles" p on p."id" = upr."user_profile_id"
      left join "discipline_staff" ds on ds."user_id" = p."user_id"
      where r."name" = ${SUBJECT_EXPERT_ROLE}
      group by p."email", p."user_id"
      order by count(ds."id") asc, p."email" asc;
    `);

    if (affected.length === 0) {
      console.info('No global subject-expert rows. Nothing to do.');
      return { affected, deleted: 0 };
    }

    console.info(
      `${affected.length} account(s) hold the global ${SUBJECT_EXPERT_ROLE} role:`,
    );
    for (const row of affected) {
      const held =
        row.discipline_count === 0
          ? 'NO disciplines — appoint them to one, or they become a plain user'
          : `${row.discipline_count} discipline(s) — unaffected`;
      console.info(`  ${row.email}  (${held})`);
    }

    if (!apply) {
      console.info('');
      console.info('Dry run — nothing was changed.');
      console.info('Re-run with --apply to remove the rows above.');
      return { affected, deleted: 0 };
    }

    const { rowCount } = await tx.execute(sql`
      delete from "user_profile_roles" upr
      using "user_roles" r
      where r."id" = upr."role_id"
        and r."name" = ${SUBJECT_EXPERT_ROLE};
    `);
    const deleted = rowCount ?? 0;

    // The ROLE itself stays. Its `role_permissions` grants are what a
    // `discipline_staff` row resolves through — deleting the role would take
    // every real subject expert's authority with it, which is the one
    // genuinely destructive thing this migration must not do.
    console.info('');
    console.info(`Deleted ${deleted} row(s) from user_profile_roles.`);
    console.info(
      `The ${SUBJECT_EXPERT_ROLE} role and its permission grants are untouched — discipline_staff resolves through them.`,
    );
    return { affected, deleted };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const apply = process.argv.includes('--apply');
  migrateDropGlobalSubjectExpert(apply)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
