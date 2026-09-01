/**
 * Idempotent migration for `discipline_staff`.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole
 * schema and offers to truncate `docs` (6917 embedding rows) over unrelated
 * pre-existing drift. Every statement here is safe to re-run.
 *
 * No role seeding here, unlike `migrate-staff-roles.ts`: this table reuses
 * the existing `subject-expert` role (and its `role_permissions` grants)
 * verbatim. A `discipline_staff` row and a `course_staff` row naming the same
 * role mean the same authority, scoped differently.
 *
 * No backfill, deliberately. There is no source of truth for which SME owns
 * which discipline today — every discipline's lessons were, until this
 * branch, editable by any course's staff or (per the reverted d4f767d) any
 * org admin. Assigning an SME to a discipline is a human decision an admin
 * must make from the admin UI (a separate task); this migration only creates
 * the table those assignments will live in. Until it is populated, every
 * disciplined lesson has no writer at all — see the task report for why that
 * is an accepted, called-out consequence rather than an oversight.
 *
 * Run: pnpm db:migrate-discipline-staff
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main(): Promise<void> {
  console.info('Creating discipline_staff…');
  await db.execute(sql`
    create table if not exists "discipline_staff" (
      "id"            integer primary key generated always as identity,
      "user_id"       varchar(255) not null references "user_profiles"("user_id") on delete cascade,
      "discipline_id" integer not null references "disciplines"("id") on delete cascade,
      "role_id"       integer not null references "user_roles"("id") on delete restrict,
      "assigned_by"   varchar(255),
      "created_at"    timestamp not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists "discipline_staff_user_discipline_role_idx"
      on "discipline_staff" ("user_id", "discipline_id", "role_id");
  `);
  await db.execute(sql`
    create index if not exists "discipline_staff_user_discipline_idx"
      on "discipline_staff" ("user_id", "discipline_id");
  `);
  await db.execute(sql`
    create index if not exists "discipline_staff_discipline_idx"
      on "discipline_staff" ("discipline_id");
  `);

  console.info('Schema applied. discipline_staff holds 0 rows by design.');
  console.info(
    'Next: assign an SME to each discipline from /admin (a separate task — no writer exists for this table yet).',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
