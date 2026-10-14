/**
 * Idempotent migration for `video_captions`.
 *
 * Hand-written rather than generated, for the reason migrate-offerings.ts
 * gives: `drizzle-kit push` diffs the whole schema and offers to truncate
 * `docs` over unrelated drift. Every statement here is safe to re-run.
 *
 * Run: pnpm db:migrate-video-captions
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main(): Promise<void> {
  console.info('Creating video_captions…');
  await db.execute(sql`
    create table if not exists "video_captions" (
      "playback_id"   text primary key,
      "asset_id"      text,
      "track_id"      text,
      "language_code" text not null,
      "status"        text not null,
      "error"         text,
      "checked_at"    timestamp with time zone not null,
      "updated_at"    timestamp with time zone not null default CURRENT_TIMESTAMP,
      constraint "video_captions_status_check"
        check ("status" in ('generating', 'ready', 'failed', 'unsupported'))
    );
  `);
  console.info('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
