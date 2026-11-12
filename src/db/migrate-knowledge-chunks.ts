import { sql } from 'drizzle-orm';
import { db } from '#/db';
import { DEBRIEF_ATTEMPT_FORMAT } from '#/lib/debrief-attempt-snapshot';

/**
 * Adds the tables behind chunk-based debriefs: `lesson_knowledge_chunks`
 * (AI-generated knowledge chunks per lesson), `debrief_chunk_mastery`
 * (per-pilot mastery of each chunk), `debrief_passes` (permanent passes) and
 * `debrief_answer_logs` (per-answer metrics), plus new nullable columns on
 * `lesson_test_results`. Legacy passes (completed attempts scoring >= 75) are
 * backfilled into `debrief_passes` and kept permanent.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` (thousands of embedding rows)
 * because of unrelated drift. These statements only add.
 *
 * Re-running is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-knowledge-chunks
 */
export const KNOWLEDGE_CHUNKS_STATEMENTS = [
  sql`create table if not exists "lesson_knowledge_chunks" (
    "id" integer generated always as identity primary key,
    "lesson_id" integer not null references "lessons"("id") on delete cascade,
    "version" integer not null,
    "source_fingerprint" text not null,
    "chunks" jsonb not null,
    "previous_mapping" jsonb,
    "created_at" timestamp with time zone not null default now()
  )`,
  sql`create unique index if not exists "lesson_knowledge_chunks_lesson_idx" on "lesson_knowledge_chunks" ("lesson_id")`,
  sql`create table if not exists "debrief_chunk_mastery" (
    "id" integer generated always as identity primary key,
    "user_id" varchar(255) not null references "user_profiles"("user_id") on delete cascade,
    "lesson_id" integer not null references "lessons"("id") on delete cascade,
    "chunk_id" text not null,
    "latest_score" integer not null,
    "cleared_at" timestamp with time zone,
    "updated_at" timestamp with time zone not null default now()
  )`,
  sql`create unique index if not exists "debrief_chunk_mastery_user_lesson_chunk_idx" on "debrief_chunk_mastery" ("user_id","lesson_id","chunk_id")`,
  sql`create table if not exists "debrief_passes" (
    "id" integer generated always as identity primary key,
    "user_id" varchar(255) not null references "user_profiles"("user_id") on delete cascade,
    "lesson_slug" text not null references "lessons"("slug") on delete cascade,
    "passed_at" timestamp with time zone not null default now()
  )`,
  sql`create unique index if not exists "debrief_passes_user_lesson_idx" on "debrief_passes" ("user_id","lesson_slug")`,
  sql`alter table "lesson_test_results" add column if not exists "format" text`,
  sql`alter table "lesson_test_results" add column if not exists "chunk_version" integer`,
  sql`alter table "lesson_test_results" add column if not exists "draft" jsonb`,
  sql`alter table "lesson_test_results" add column if not exists "finished_reason" text`,
  // One open chunk-format attempt per pilot and lesson (concurrent starts).
  // Every row is legacy (format null) when this first runs, so it cannot fail.
  // The format is inlined, never bound: an index predicate takes no parameters.
  sql`create unique index if not exists "lesson_test_results_one_open_attempt_idx" on "lesson_test_results" ("user_id","lesson_slug") where "completed_at" is null and "format" = ${sql.raw(`'${DEBRIEF_ATTEMPT_FORMAT}'`)}`,
  sql`create table if not exists "debrief_answer_logs" (
    "id" integer generated always as identity primary key,
    "attempt_id" integer not null references "lesson_test_results"("id") on delete cascade,
    "question_id" text not null,
    "metrics" jsonb not null,
    "created_at" timestamp with time zone not null default now()
  )`,
  sql`create unique index if not exists "debrief_answer_logs_attempt_question_idx" on "debrief_answer_logs" ("attempt_id","question_id")`,
  // Legacy passes, kept permanent. Must run after debrief_passes exists.
  sql`insert into "debrief_passes" ("user_id","lesson_slug","passed_at")
    select "user_id","lesson_slug", min("completed_at")
    from "lesson_test_results"
    where "completed_at" is not null and "total_score" >= 75
    group by "user_id","lesson_slug"
    on conflict do nothing`,
];

async function main() {
  await db.transaction(async (tx) => {
    for (const statement of KNOWLEDGE_CHUNKS_STATEMENTS) {
      await tx.execute(statement);
    }
  });
  console.log(
    'Knowledge chunk tables are in place and legacy passes backfilled.',
  );
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-knowledge-chunks.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
