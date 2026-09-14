/**
 * Contract migration: drop `modules.rank` now that `course_modules.rank`
 * (Task 1, `migrate-course-modules.ts`) is the only order source every reader
 * and writer uses — the board, the learner payload, `createModule` and
 * `reorderModule` all read and write the placement's rank alone.
 *
 * DEPLOYMENT ORDERING: relax first, then deploy, then run this. The live
 * column is `NOT NULL` with no default, so deploying the Task 7 code before
 * the column is nullable 500s every `createModule`, and dropping the column
 * before the deploy 500s the OLD `createModule` (writes it) and
 * `reorderModule` (mirrors onto it) until the new code lands.
 * `migrate-relax-module-rank.ts` (`pnpm db:relax-module-rank`) is the one
 * step compatible with both sides — see its header for the full runbook.
 * This step is safe only once the deployed code no longer writes the column.
 * ROLLBACK: before this step, reverting the deploy is degraded-not-broken
 * (old code reads `modules.rank`, NULL on new-code-created modules — see
 * the relax script's header for the by-hand backfill); after this step
 * there is no rollback — the column and its values are gone.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole
 * schema and offers to truncate `docs` over unrelated pre-existing drift.
 * Idempotent: a second run finds the column gone and returns without
 * touching anything. The probe reads `information_schema`, never
 * `schema.ts` — the live database is the only authority on what it holds.
 *
 * Run: pnpm db:migrate-drop-module-rank
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

export async function migrateDropModuleRank(): Promise<void> {
  // `table_schema = 'public'` pins the probe to the schema the unqualified
  // `alter table "modules"` below is expected to resolve to; without it a
  // same-named table in another schema could answer for this one.
  const { rows: cols } = await db.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'modules' and column_name = 'rank'`);
  if (cols.length === 0) {
    console.info('modules.rank already dropped — nothing to do.');
    return;
  }

  // Refuse while any module lacks a placement: dropping the column would
  // destroy the only record of that module's position.
  const { rows } = await db.execute<{ orphans: number }>(sql`
    select count(*)::int as orphans from modules m
    where not exists (select 1 from course_modules cm where cm.module_id = m.id)`);
  const orphans = rows[0]?.orphans ?? -1;
  if (orphans !== 0) {
    throw new Error(
      `${orphans} modules have no course_modules row — run db:migrate-course-modules first`,
    );
  }

  console.info('Dropping modules.rank…');
  await db.execute(sql`alter table "modules" drop column "rank"`);

  const { rows: after } = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'modules' and column_name = 'rank'`);
  if ((after[0]?.n ?? -1) !== 0) {
    throw new Error('modules.rank still present after drop');
  }
  console.info('modules.rank dropped.');
}

// Guarded so importing this module (e.g. from its unit test) never runs the
// migration against the live database — matches migrate-course-modules.ts.
if (process.argv[1]?.endsWith('migrate-drop-module-rank.ts')) {
  migrateDropModuleRank()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
