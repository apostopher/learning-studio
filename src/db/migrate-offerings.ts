/**
 * Idempotent migration for `offerings` and `offering_users`.
 *
 * Hand-written rather than generated, for the reason `migrate-discipline-
 * staff.ts` gives: `drizzle-kit push` diffs the whole schema and offers to
 * truncate `docs` (thousands of embedding rows) over unrelated pre-existing
 * drift. Every statement here is safe to re-run.
 *
 * No backfill. Nothing in the database records when a course has been run
 * before — that history has only ever lived in the calendar these tables now
 * back — so they start empty and fill as offerings are scheduled.
 *
 * Run: pnpm db:migrate-offerings
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main(): Promise<void> {
  console.info('Creating offerings…');
  await db.execute(sql`
    create table if not exists "offerings" (
      "id"         integer primary key generated always as identity,
      "course_id"  integer not null references "courses"("id") on delete cascade,
      "starts_on"  date not null,
      "ends_on"    date not null,
      "created_by" varchar(255),
      "created_at" timestamp not null default now(),
      "updated_at" timestamp not null default now()
    );
  `);

  // Enforced in the database as well as in the zod schema: an offering that
  // ends before it starts draws a bar with no days in it, which reads as a
  // missing offering rather than a broken one.
  await db.execute(sql`
    alter table "offerings"
      drop constraint if exists "offerings_dates_ordered";
  `);
  await db.execute(sql`
    alter table "offerings"
      add constraint "offerings_dates_ordered"
      check ("ends_on" >= "starts_on");
  `);

  await db.execute(sql`
    create index if not exists "offerings_course_id_idx"
      on "offerings" ("course_id");
  `);
  await db.execute(sql`
    create index if not exists "offerings_starts_on_idx"
      on "offerings" ("starts_on");
  `);

  console.info('Creating offering_users…');
  await db.execute(sql`
    create table if not exists "offering_users" (
      "id"          integer primary key generated always as identity,
      "offering_id" integer not null references "offerings"("id") on delete cascade,
      "user_id"     varchar(255) not null references "user_profiles"("user_id") on delete cascade,
      "assigned_by" varchar(255),
      "created_at"  timestamp not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists "offering_users_offering_user_idx"
      on "offering_users" ("offering_id", "user_id");
  `);
  await db.execute(sql`
    create index if not exists "offering_users_offering_id_idx"
      on "offering_users" ("offering_id");
  `);
  await db.execute(sql`
    create index if not exists "offering_users_user_id_idx"
      on "offering_users" ("user_id");
  `);

  console.info('offerings and offering_users ready.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
