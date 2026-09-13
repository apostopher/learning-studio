/**
 * Contract migration: drop `modules.rank` now that `course_modules.rank`
 * (Task 1, `migrate-course-modules.ts`) is the only order source every reader
 * and writer uses — the board, the learner payload, `createModule` and
 * `reorderModule` all read and write the placement's rank alone.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole
 * schema and offers to truncate `docs` over unrelated pre-existing drift.
 * Idempotent: a second run finds the column gone and exits 0 without touching
 * anything. The probe reads `information_schema`, never `schema.ts` — the
 * live database is the only authority on what it holds.
 *
 * Run: pnpm db:migrate-drop-module-rank
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main() {
  const { rows: cols } = await db.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_name = 'modules' and column_name = 'rank'`);
  if (cols.length === 0) {
    console.log('modules.rank already dropped — nothing to do.');
    process.exit(0);
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

  await db.execute(sql`alter table "modules" drop column "rank"`);

  const { rows: after } = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.columns
    where table_name='modules' and column_name='rank'`);
  if ((after[0]?.n ?? -1) !== 0) {
    throw new Error('modules.rank still present after drop');
  }
  console.log('modules.rank dropped.');
  process.exit(0);
}

// Guarded so importing this module (e.g. from its unit test) never runs the
// migration against the live database — matches migrate-course-modules.ts.
if (process.argv[1]?.endsWith('migrate-drop-module-rank.ts')) {
  await main();
}
