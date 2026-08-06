import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Applies the org-personas schema change by hand, rather than via
 * `drizzle-kit push`.
 *
 * `push` diffs the *whole* schema against the database, and this database has
 * pre-existing drift unrelated to personas: it wants to add
 * `uniq_course_source_heading_chunk` to `docs`, and offers to **truncate**
 * that table (6917 embedding rows) to do it. Running push to get three columns
 * and a join table would mean answering that prompt under pressure. These
 * statements touch nothing but `personas` and `course_orgs`.
 *
 * Every statement is `IF NOT EXISTS`/`IF EXISTS`, so re-running is a no-op and
 * the two halves (pre- and post-backfill) can be run independently.
 *
 * Usage:
 *   pnpm db:migrate-org-personas          # columns, tables, indexes
 *   pnpm db:seed-org-links                # backfill
 *   pnpm db:migrate-org-personas --finish # org_id -> NOT NULL
 */
async function main() {
  const finish = process.argv.includes('--finish');

  if (finish) {
    // Only safe once every row has an org. Postgres rejects this outright if
    // any null remains, which is the check we want — no silent partial state.
    await db.execute(
      sql`alter table "personas" alter column "org_id" set not null`,
    );
    console.log('personas.org_id is now NOT NULL');
    process.exit(0);
  }

  // --- personas: new columns ------------------------------------------------
  await db.execute(
    sql`alter table "personas" add column if not exists "org_id" integer references "organizations"("id") on delete cascade`,
  );
  await db.execute(
    sql`alter table "personas" add column if not exists "draft_content" jsonb`,
  );
  await db.execute(
    sql`alter table "personas" add column if not exists "is_org_default" boolean not null default false`,
  );

  // --- personas: name uniqueness moves from global to per-org ---------------
  // Two orgs must each be able to have a persona called "Viper7".
  await db.execute(
    sql`alter table "personas" drop constraint if exists "personas_name_unique"`,
  );
  await db.execute(
    sql`create unique index if not exists "personas_org_name_idx" on "personas" ("org_id", "name")`,
  );
  await db.execute(
    sql`create index if not exists "personas_org_id_idx" on "personas" ("org_id")`,
  );
  // At most one default per org, enforced by the database rather than by
  // remembering to clear the previous one.
  await db.execute(
    sql`create unique index if not exists "personas_org_default_idx" on "personas" ("org_id") where "is_org_default"`,
  );

  // --- course_orgs ----------------------------------------------------------
  await db.execute(sql`
    create table if not exists "course_orgs" (
      "id" integer primary key generated always as identity,
      "course_id" integer not null references "courses"("id") on delete cascade,
      "org_id" integer not null references "organizations"("id") on delete cascade,
      "persona_id" integer references "personas"("id") on delete set null,
      "created_at" timestamp not null default now(),
      "updated_at" timestamp not null default now()
    )
  `);
  await db.execute(
    sql`create unique index if not exists "course_orgs_course_org_idx" on "course_orgs" ("course_id", "org_id")`,
  );
  await db.execute(
    sql`create index if not exists "course_orgs_org_id_idx" on "course_orgs" ("org_id")`,
  );
  await db.execute(
    sql`create index if not exists "course_orgs_persona_id_idx" on "course_orgs" ("persona_id")`,
  );

  console.log(
    'Schema applied. Next: pnpm db:seed-org-links, then pnpm db:migrate-org-personas --finish',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
