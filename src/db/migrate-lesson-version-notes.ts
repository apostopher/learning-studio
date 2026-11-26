import { sql } from 'drizzle-orm';

/**
 * Adds `lesson_version_notes`: what an SME wrote about what changed in one
 * version of a lesson. One row per (lesson, version) — the version is a label
 * an author may use again, and using it again edits the same note. Empty to
 * begin with.
 *
 * Run BEFORE deploying the code that reads it: the lesson editor asks for the
 * current version's notes as it opens. The code before it never names the
 * table.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` because of unrelated drift.
 *
 * Re-running is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-lesson-version-notes
 */
export const LESSON_VERSION_NOTES_STATEMENTS = [
  sql`create table if not exists "lesson_version_notes" (
    "lesson_id" integer not null constraint "lesson_version_notes_lesson_id_lessons_id_fk" references "lessons"("id") on delete cascade,
    "version" text not null,
    "notes" text not null,
    "updated_at" timestamp not null default now(),
    constraint "lesson_version_notes_lesson_id_version_pk" primary key ("lesson_id","version")
  )`,
];

async function main() {
  // Imported here so tests can run the statements on their own database without
  // building the client `#/db` opens on DATABASE_URL.
  const { db } = await import('#/db');
  for (const statement of LESSON_VERSION_NOTES_STATEMENTS) {
    await db.execute(statement);
  }
  console.log('lesson_version_notes is in place.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-lesson-version-notes.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
