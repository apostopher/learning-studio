import { sql } from 'drizzle-orm';

/**
 * Adds `course_lesson_visibility`: whether a course shows a lesson to its
 * learners. Empty to begin with. Where a course has no row the lesson's
 * `is_available` counts, so nothing anybody sees changes.
 *
 * Run BEFORE deploying the code that reads it: learner pages fail without it.
 * The code before it never names the table, but what it hides or shows between
 * the two still changes the starting point in every course.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` because of unrelated drift.
 *
 * Re-running is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-lesson-visibility
 */
export const LESSON_VISIBILITY_STATEMENTS = [
  sql`create table if not exists "course_lesson_visibility" (
    "course_id" integer not null constraint "course_lesson_visibility_course_id_courses_id_fk" references "courses"("id") on delete cascade,
    "lesson_id" integer not null constraint "course_lesson_visibility_lesson_id_lessons_id_fk" references "lessons"("id") on delete cascade,
    "is_visible" boolean not null,
    "updated_at" timestamp not null default now(),
    constraint "course_lesson_visibility_course_id_lesson_id_pk" primary key ("course_id","lesson_id")
  )`,
];

async function main() {
  // Imported here so tests can run the statements on their own database without
  // building the client `#/db` opens on DATABASE_URL.
  const { db } = await import('#/db');
  for (const statement of LESSON_VISIBILITY_STATEMENTS) {
    await db.execute(statement);
  }
  console.log('course_lesson_visibility is in place.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-lesson-visibility.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
