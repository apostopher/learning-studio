import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Schema for owner/admin roles, role permissions and pre-assigned enrolments.
 *
 * Hand-written rather than `drizzle-kit push`, for the same reason as
 * `migrate-org-personas.ts`: push diffs the whole schema and offers to
 * **truncate `docs`** (6917 embedding rows) over unrelated pre-existing drift.
 * These statements touch only the tables this change owns.
 *
 * Every statement is `IF NOT EXISTS`, so re-running is a no-op.
 *
 *   pnpm db:migrate-user-management
 */
async function main() {
  // --- the owner role -------------------------------------------------------
  // A row in the existing roles table, not a new mechanism: `hasAdminAccess`
  // widens the admin gates to admin-or-owner, leaving the 34 content routes
  // untouched.
  await db.execute(sql`
    insert into "user_roles" ("name", "description")
    values ('owner', 'Superuser: manages users, roles and permissions')
    on conflict ("name") do nothing
  `);

  // --- role_permissions -----------------------------------------------------
  await db.execute(sql`
    create table if not exists "role_permissions" (
      "id" integer primary key generated always as identity,
      "role_id" integer not null references "user_roles"("id") on delete cascade,
      "entity" varchar(50) not null,
      "action" varchar(20) not null,
      "created_at" timestamp not null default now()
    )
  `);
  await db.execute(
    sql`create unique index if not exists "role_permissions_role_entity_action_idx" on "role_permissions" ("role_id", "entity", "action")`,
  );
  await db.execute(
    sql`create index if not exists "role_permissions_role_idx" on "role_permissions" ("role_id")`,
  );

  // --- pending_enrolments ---------------------------------------------------
  await db.execute(sql`
    create table if not exists "pending_enrolments" (
      "id" integer primary key generated always as identity,
      "email" varchar(100) not null,
      "course_id" integer not null references "courses"("id") on delete cascade,
      "added_by" varchar(255),
      "added_at" timestamp not null default now(),
      "claimed_at" timestamp
    )
  `);
  await db.execute(
    sql`create unique index if not exists "pending_enrolments_email_course_idx" on "pending_enrolments" ("email", "course_id")`,
  );
  await db.execute(
    sql`create index if not exists "pending_enrolments_email_idx" on "pending_enrolments" ("email")`,
  );

  // --- audit actor on existing entitlements ---------------------------------
  await db.execute(
    sql`alter table "course_subscriptions" add column if not exists "granted_by" varchar(255)`,
  );

  // NOTE: `role_permissions` is deliberately left EMPTY. The admin role gains
  // nothing until an owner grants it — today's two admins keep exactly the
  // content-authoring access they already had, and nothing changes underneath
  // them silently.
  const roles = await db.execute(
    sql`select id, name from "user_roles" order by id`,
  );
  console.log(
    [
      'Schema applied.',
      `Roles: ${roles.rows.map((r) => `${r.name}(${r.id})`).join(', ')}`,
      'role_permissions is intentionally empty — grant from /admin/users.',
      'Next: pnpm db:grant-role <your-email> owner',
    ].join('\n'),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
