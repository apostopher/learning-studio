import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Create `course_remixes` — the link table behind course remixing (spec:
 * docs/superpowers/specs/2026-09-12-course-remixing-design.md).
 *
 * Purely additive: no existing row changes and no read path consults the
 * table until a remix exists, so this can run any time before the Plan 2
 * code deploys and needs no relax/drop dance. Idempotent: probes
 * `information_schema`-equivalent `to_regclass` first and exits if the table
 * is already there, matching `migrate-course-modules.ts`.
 *
 * Both foreign keys are spelled out by hand because their `on delete`
 * clauses differ and that difference is the design: a remixer going away
 * takes its links with it (cascade); a SOURCE going away must be refused
 * (restrict) — see the table's comment in schema.ts.
 *
 * Run: pnpm db:migrate-course-remixes
 */
export async function migrateCourseRemixes(): Promise<'created' | 'exists'> {
  const { rows } = await db.execute<{ exists: boolean }>(
    sql`select to_regclass(${'public.course_remixes'}) is not null as exists`,
  );
  if (rows[0]?.exists === true) return 'exists';

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      create table "course_remixes" (
        "id" integer primary key generated always as identity,
        "course_id" integer not null references "courses"("id") on delete cascade,
        "source_course_id" integer not null references "courses"("id") on delete restrict,
        "created_by" varchar(255),
        "created_at" timestamp not null default now()
      )`);
    await tx.execute(sql`
      create unique index "course_remixes_course_source_idx"
        on "course_remixes" ("course_id", "source_course_id")`);
    await tx.execute(sql`
      create index "course_remixes_source_course_id_idx" on "course_remixes" ("source_course_id")`);
  });
  return 'created';
}

async function main() {
  const outcome = await migrateCourseRemixes();
  console.log(
    outcome === 'exists'
      ? 'course_remixes already exists — nothing to do.'
      : 'course_remixes created.',
  );
  process.exit(0);
}

// Guarded so the function can be imported by its unit test without the
// import itself running against the live database.
if (process.argv[1]?.endsWith('migrate-course-remixes.ts')) {
  await main();
}
