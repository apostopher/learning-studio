import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Adds `lesson_completions` (sticky lesson done time) and `prepared_debriefs`
 * (debrief quizzes generated ahead of the 24h wait) for spaced-review debriefs,
 * plus an index on `lesson_test_results` for looking up completed tests by
 * user and lesson.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` (thousands of embedding rows)
 * because of unrelated drift. These statements only add.
 *
 * Re-running is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-debrief-review
 */
export const DEBRIEF_REVIEW_STATEMENTS = [
  sql`create table if not exists "lesson_completions" (
    "id" integer generated always as identity primary key,
    "user_id" varchar(255) not null references "user_profiles"("user_id") on delete cascade,
    "lesson_id" integer not null references "lessons"("id") on delete cascade,
    "done_at" timestamp with time zone not null default now()
  )`,
  sql`create unique index if not exists "lesson_completions_user_lesson_idx" on "lesson_completions" ("user_id","lesson_id")`,
  sql`create table if not exists "prepared_debriefs" (
    "id" integer generated always as identity primary key,
    "user_id" varchar(255) not null references "user_profiles"("user_id") on delete cascade,
    "course_id" integer not null references "courses"("id") on delete cascade,
    "lesson_slug" text not null references "lessons"("slug") on delete cascade,
    "test" json not null,
    "source_fingerprint" text not null,
    "created_at" timestamp with time zone not null default now()
  )`,
  sql`create unique index if not exists "prepared_debriefs_user_course_lesson_idx" on "prepared_debriefs" ("user_id","course_id","lesson_slug")`,
  sql`create index if not exists "lesson_test_results_user_lesson_completed_idx" on "lesson_test_results" ("user_id","lesson_slug","completed_at")`,
];

async function main() {
  await db.transaction(async (tx) => {
    for (const statement of DEBRIEF_REVIEW_STATEMENTS) {
      await tx.execute(statement);
    }
  });
  console.log('lesson_completions and prepared_debriefs are in place.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-debrief-review.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
