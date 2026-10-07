/**
 * Idempotent migration for `video_calls`.
 *
 * Hand-written rather than generated, for the reason migrate-offerings.ts
 * gives: `drizzle-kit push` diffs the whole schema and offers to truncate
 * `docs` over unrelated drift. Every statement here is safe to re-run.
 *
 * Run: pnpm db:migrate-video-calls
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main(): Promise<void> {
  console.info('Creating video_calls…');
  await db.execute(sql`
    create table if not exists "video_calls" (
      "id"                    varchar(255) primary key,
      "user_id"               varchar(255) not null references "user_profiles"("user_id") on delete cascade,
      "user_name"             varchar(255),
      "chat_id"               varchar(255) not null references "ai_chats"("id") on delete cascade,
      "course_slug"           varchar(255),
      "tavus_conversation_id" varchar(255) not null,
      "status"                varchar(16) not null default 'active',
      "reserved_seconds"      integer not null,
      "started_at"            timestamp with time zone not null default CURRENT_TIMESTAMP,
      "ended_at"              timestamp with time zone,
      "duration_seconds"      integer,
      "end_reason"            varchar(16),
      "transcript_saved_at"   timestamp with time zone,
      constraint "video_calls_status_check" check ("status" in ('active', 'ended'))
    );
  `);
  await db.execute(sql`
    create unique index if not exists "video_calls_tavus_conversation_idx"
      on "video_calls" ("tavus_conversation_id");
  `);
  // At most one active call per user — the race guard behind the 409.
  await db.execute(sql`
    create unique index if not exists "video_calls_one_active_per_user_idx"
      on "video_calls" ("user_id") where "status" = 'active';
  `);
  await db.execute(sql`
    create index if not exists "video_calls_user_started_idx"
      on "video_calls" ("user_id", "started_at");
  `);
  console.info('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
