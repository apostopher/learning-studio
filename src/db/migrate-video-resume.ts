import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Adds `video_resume_positions`: where each learner last left each lesson's
 * video, so the player can resume there.
 *
 * Hand-written rather than `drizzle-kit push`: push diffs the whole schema
 * and, on this database, offers to truncate `docs` over unrelated drift.
 * These statements only add, and re-running them is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-video-resume
 */
export const VIDEO_RESUME_STATEMENTS = [
  sql`create table if not exists "video_resume_positions" (
    "user_id"          varchar(255) not null references "user_profiles"("user_id") on delete cascade,
    "lesson_id"        integer not null references "lessons"("id") on delete cascade,
    "position_seconds" real not null,
    "duration_seconds" real not null,
    "updated_at"       timestamp with time zone not null default now(),
    constraint "video_resume_positions_user_id_lesson_id_pk" primary key ("user_id", "lesson_id")
  )`,
];

async function main() {
  await db.transaction(async (tx) => {
    for (const statement of VIDEO_RESUME_STATEMENTS) {
      await tx.execute(statement);
    }
  });
  console.log('video_resume_positions is in place.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-video-resume.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
