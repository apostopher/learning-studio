import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Adds `docs.lesson_slug` (lesson embeddings) and `ai_chats.summary` /
 * `summarized_through_order` (rolling summary) for Viper context compaction.
 *
 * By hand rather than `drizzle-kit push`: push diffs the whole schema and, on
 * this database, offers to truncate `docs` (thousands of embedding rows)
 * because of unrelated drift. These statements only add.
 *
 * Re-running is a no-op.
 *
 * Usage:
 *   pnpm db:migrate-viper-context
 */
export const VIPER_CONTEXT_STATEMENTS = [
  sql`alter table "docs" add column if not exists "lesson_slug" text references "lessons"("slug") on delete cascade`,
  sql`create index if not exists "docs_lesson_slug_idx" on "docs" ("lesson_slug")`,
  sql`alter table "ai_chats" add column if not exists "summary" text`,
  sql`alter table "ai_chats" add column if not exists "summarized_through_order" integer`,
];

async function main() {
  await db.transaction(async (tx) => {
    for (const statement of VIPER_CONTEXT_STATEMENTS) {
      await tx.execute(statement);
    }
  });
  console.log('docs.lesson_slug and ai_chats summary columns are in place.');
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-viper-context.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
