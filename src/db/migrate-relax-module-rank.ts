/**
 * Deploy-ordering step for `migrate-drop-module-rank.ts`: relax
 * `modules.rank` to nullable BEFORE deploying the code that stops writing
 * it (Task 7 — `createModule` no longer inserts it, `reorderModule` no
 * longer mirrors onto it).
 *
 * DEPLOYMENT ORDERING — the hazard is symmetric; neither order of {deploy
 * code, drop column} is window-free on its own:
 *
 *   - deploy first → the new `createModule` INSERT omits `rank`, still
 *     `NOT NULL` with no default → every module-create 500s until the drop
 *     runs.
 *   - drop first   → the still-live OLD code writes `rank` on every
 *     `createModule` and mirrors it on every `reorderModule` → both admin
 *     actions 500 until the new code deploys.
 *
 * This statement closes the window because it is backward-compatible with
 * BOTH: the old code's real value is accepted by a nullable column, and the
 * new code's omission is allowed by one. Runbook:
 *
 *   1. pnpm db:relax-module-rank          (this file — before the deploy)
 *   2. deploy the Task 7 code
 *   3. pnpm db:migrate-drop-module-rank   (once the deploy is healthy)
 *
 * Same shape as `migrate-relax-lesson-columns.ts` → `migrate-drop-lesson-
 * module-id.ts` (`docs/deploy-lessons-module-id-drop.md`).
 *
 * Idempotent past every point in that runbook: a no-op when the column is
 * already nullable (a re-run) or already gone (step 3 has happened).
 * `alter column … drop not null` has no `if exists` form — the column must
 * exist or Postgres raises — so the probe comes first.
 *
 * Run: pnpm db:relax-module-rank
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

export async function migrateRelaxModuleRank(): Promise<void> {
  // `table_schema = 'public'` pins the probe to the schema the unqualified
  // `alter table "modules"` below is expected to resolve to; without it a
  // same-named table in another schema could answer for this one.
  const { rows } = await db.execute<{ is_nullable: 'YES' | 'NO' }>(sql`
    select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'modules' and column_name = 'rank'`);
  const column = rows[0];

  if (!column) {
    console.info(
      'modules.rank already dropped by migrate-drop-module-rank — nothing to relax.',
    );
    return;
  }
  if (column.is_nullable === 'YES') {
    console.info('modules.rank is already nullable — nothing to do.');
    return;
  }

  console.info('Relaxing modules.rank to nullable…');
  await db.execute(
    sql`alter table "modules" alter column "rank" drop not null`,
  );
  console.info('Done.');
}

// Guarded so importing this module (e.g. from its unit test) never runs the
// migration against the live database — matches migrate-course-modules.ts.
if (process.argv[1]?.endsWith('migrate-relax-module-rank.ts')) {
  migrateRelaxModuleRank()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
