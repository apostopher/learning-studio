import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Adds `courses.pass_mark` (0-100, default 85): the debrief score a learner
 * needs in this course to pass. Existing rows take the default.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` because of unrelated drift. These
 * statements only add.
 *
 * Re-running is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-pass-mark
 */
export const PASS_MARK_STATEMENTS = [
  sql`alter table "courses" add column if not exists "pass_mark" integer not null default 85`,
  sql`do $$
  begin
    if not exists (select 1 from pg_constraint where conname = 'courses_pass_mark_check') then
      alter table "courses" add constraint "courses_pass_mark_check" check ("pass_mark" between 0 and 100);
    end if;
  end
  $$`,
];

async function main() {
  await db.transaction(async (tx) => {
    for (const statement of PASS_MARK_STATEMENTS) {
      await tx.execute(statement);
    }
  });
  console.log('courses.pass_mark is in place.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-pass-mark.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
