/**
 * Deploy-ordering step for Task 7's contract migration
 * (`migrate-drop-lesson-module-id.ts`): relax `lessons.module_id` AND
 * `lessons.rank` to nullable BEFORE deploying the code that stops writing
 * either of them.
 *
 * (Originally named `migrate-relax-lesson-module-id.ts` and only relaxed
 * `module_id` — fix round 2 found `rank` is ALSO `NOT NULL` with no
 * default, and the code deployed alongside this task stops writing it too,
 * so relaxing only `module_id` left the exact same class of window open on
 * a different column. Renamed so the file matches what it actually does.)
 *
 * The hazard `migrate-drop-lesson-module-id.ts`'s header describes is
 * symmetric — there is no order of {deploy code, run contract migration}
 * that avoids a window where one side is live and the other isn't:
 *
 *   - deploy code first  → `createLesson`'s INSERT omits `module_id`/`rank`,
 *     both still `NOT NULL` → every lesson-create 500s until the migration
 *     runs.
 *   - migrate first       → the still-live OLD code still writes
 *     `moduleId`/`rank` on every `createLesson`/`moveLesson` call, but the
 *     columns are already gone → the same two admin actions 500 until the
 *     new code deploys.
 *
 * This statement is what actually removes the window, because it is
 * backward-compatible with BOTH the old code (which still writes both
 * columns — nullable columns happily accept a real value) and the new code
 * (which stops writing either — nullable columns don't require one). Run
 * this, THEN deploy, THEN run `migrate-drop-lesson-module-id.ts` once the
 * deploy is confirmed healthy. See `docs/deploy-lessons-module-id-drop.md`
 * for the full runbook.
 *
 * `lessons.org_id` is NOT NULL too (Task 5/6) but is NOT relaxed here: the
 * new code (`createLesson`, fix round 2) resolves and writes a real
 * `org_id` on every insert, so there is no window on that column to close —
 * `module_id` and `rank` are the whole set of columns the OLD code wrote
 * that the NEW code stops writing (verified against every field in
 * `lessonsTable`).
 *
 * Idempotent, including PAST the point the contract migration has already
 * run: probes `information_schema.columns` for each of `module_id`/`rank`
 * first (unlike `if exists`, `alter column ... drop not null` has no
 * existence-guarded form — the column simply must exist or Postgres raises
 * `column does not exist`), and relaxes only the ones still present. Once
 * the contract migration has dropped both, this is a no-op.
 *
 * Run: pnpm db:relax-lesson-columns
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

export async function migrateRelaxLessonColumns(): Promise<void> {
  const { rows } = await db.execute<{ column_name: string }>(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'lessons'
      and column_name in ('module_id', 'rank');
  `);
  const present = new Set(rows.map((r) => r.column_name));

  if (present.size === 0) {
    console.info(
      'lessons.module_id/rank already dropped by the contract migration — nothing to relax.',
    );
    return;
  }

  if (present.has('module_id')) {
    console.info('Relaxing lessons.module_id to nullable…');
    await db.execute(
      sql`alter table "lessons" alter column "module_id" drop not null;`,
    );
  }
  if (present.has('rank')) {
    console.info('Relaxing lessons.rank to nullable…');
    await db.execute(
      sql`alter table "lessons" alter column "rank" drop not null;`,
    );
  }

  console.info('Done.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateRelaxLessonColumns()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
