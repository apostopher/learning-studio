import { sql } from 'drizzle-orm';

/**
 * Adds `lessons.version_notes`: one running note per lesson in which the SME
 * keeps track of what changed, version by version ("1.0 added intro section",
 * then "1.1 updated French video" appended beneath). Empty to begin with.
 *
 * Replaces the per-version `lesson_version_notes` table of 2026-11-27, which
 * held no rows when it was replaced. Rollout:
 *
 *   1. pnpm db:migrate-lesson-version-notes            (adds the column)
 *   2. deploy                                          (code reads the column)
 *   3. pnpm db:migrate-lesson-version-notes --drop-old-table
 *
 * Step 1 before 2: the lesson editor reads the notes as it opens. Step 3 after
 * 2: the code deployed before it still reads the old table.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` because of unrelated drift.
 *
 * Re-running either step is a no-op.
 */
export const LESSON_VERSION_NOTES_STATEMENTS = [
  sql`alter table "lessons" add column if not exists "version_notes" text not null default ''`,
];

export const DROP_OLD_VERSION_NOTES_TABLE_STATEMENTS = [
  sql`drop table if exists "lesson_version_notes"`,
];

async function main() {
  // Imported here so tests can run the statements on their own database without
  // building the client `#/db` opens on DATABASE_URL.
  const { db } = await import('#/db');
  const dropOld = process.argv.includes('--drop-old-table');
  for (const statement of dropOld
    ? DROP_OLD_VERSION_NOTES_TABLE_STATEMENTS
    : LESSON_VERSION_NOTES_STATEMENTS) {
    await db.execute(statement);
  }
  console.log(
    dropOld
      ? 'lesson_version_notes table is gone.'
      : 'lessons.version_notes is in place.',
  );
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-lesson-version-notes.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
