/**
 * Deploy-ordering step for Task 7's contract migration
 * (`migrate-drop-lesson-module-id.ts`): relax `lessons.module_id` to
 * nullable BEFORE deploying the code that stops writing it.
 *
 * The hazard `migrate-drop-lesson-module-id.ts`'s header describes is
 * symmetric — there is no order of {deploy code, run contract migration}
 * that avoids a window where one side is live and the other isn't:
 *
 *   - deploy code first  → `createLesson`'s INSERT omits `module_id`, which
 *     is still `NOT NULL` → every lesson-create 500s until the migration runs.
 *   - migrate first       → the still-live OLD code still writes
 *     `moduleId`/`rank` on every `createLesson`/`moveLesson` call, but the
 *     columns are already gone → the same two admin actions 500 until the
 *     new code deploys.
 *
 * This statement is what actually removes the window, because it is
 * backward-compatible with BOTH the old code (which still writes the
 * column — a nullable column happily accepts a real value) and the new
 * code (which stops writing it — a nullable column doesn't require one).
 * Run this, THEN deploy, THEN run `migrate-drop-lesson-module-id.ts` once
 * the deploy is confirmed healthy. See `docs/deploy-lessons-module-id-drop
 * .md` for the full runbook.
 *
 * Idempotent: `drop not null` on an already-nullable column is a no-op.
 *
 * Run: pnpm db:relax-lesson-module-id
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

export async function migrateRelaxLessonModuleId(): Promise<void> {
  console.info('Relaxing lessons.module_id to nullable…');
  await db.execute(
    sql`alter table "lessons" alter column "module_id" drop not null;`,
  );
  console.info('Done.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateRelaxLessonModuleId()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
