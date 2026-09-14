/**
 * Deploy-ordering step for `migrate-drop-module-rank.ts`: relax
 * `modules.rank` to nullable BEFORE deploying the code that stops writing
 * it (Task 7 — `createModule` no longer inserts it, `reorderModule` no
 * longer mirrors onto it) — and, first, place every module that has no
 * `course_modules` row yet.
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
 * ROLLBACK WITHIN THE WINDOW (after 1 + 2, before 3): reverting the deploy
 * is degraded, not broken. The old code reads `modules.rank`, which every
 * module the NEW code created is left NULL on — those sort last in the old
 * board and rail (NULLs order after values), and the old `reorderModule`
 * keeps writing NULL ranks for them. Everything the new code reordered via
 * `course_modules.rank` is likewise invisible to the old code. If the
 * revert is going to stay, backfill `modules.rank` from `course_modules.rank`
 * by hand (`update modules m set rank = cm.rank from course_modules cm where
 * cm.module_id = m.id and cm.course_id = m.course_id`) — nothing automates
 * that direction. After step 3 there is no rollback: the column and every
 * value it held are gone, and the old code 500s on every module read.
 *
 * STRAGGLERS (final review, Important 2): `migrate-course-modules.ts`
 * backfilled `course_modules` once, live, and early-exits forever after — so
 * every module created on `main` between that run and this deploy has a
 * `modules.rank` and no placement: invisible to the new board and rail, and
 * a hard refusal at step 3's orphan gate. This script runs while
 * `modules.rank` is still authoritative, so it is the last moment that rank
 * can be copied across; it does so BEFORE relaxing the constraint. A module
 * the new code creates after the deploy has a placement already (and a NULL
 * `modules.rank`), so the `not exists` filter never copies a NULL. Re-runs
 * are safe for the same reason: `not exists` inserts nothing twice.
 *
 * Same shape as `migrate-relax-lesson-columns.ts` → `migrate-drop-lesson-
 * module-id.ts` (`docs/deploy-lessons-module-id-drop.md`).
 *
 * Idempotent past every point in that runbook: a no-op when the column is
 * already nullable (a re-run — the straggler backfill still runs, since old
 * code may have created more in between) or already gone (step 3 has
 * happened — nothing left to copy from, so the backfill is skipped too).
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
      'modules.rank already dropped by migrate-drop-module-rank — nothing to relax, no rank left to backfill stragglers from.',
    );
    return;
  }

  // Stragglers first, while the column still holds every module's real rank
  // — see the header. Ordered BEFORE the ALTER: nothing the new code writes
  // is a straggler (it places on create), so this only ever copies a value
  // the OLD code wrote.
  const backfill = await db.execute(sql`
    insert into course_modules (course_id, module_id, rank)
    select m.course_id, m.id, m.rank from modules m
    where not exists (select 1 from course_modules cm where cm.module_id = m.id)`);
  console.info(
    `Placed ${backfill.rowCount ?? 0} straggler module(s) into course_modules from modules.rank.`,
  );

  if (column.is_nullable === 'YES') {
    console.info('modules.rank is already nullable — nothing to relax.');
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
