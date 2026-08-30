/**
 * Contract migration: drop `lessons.module_id`, `lessons.rank` and
 * `lesson_dependencies` now that `module_lessons` (Task 5/6,
 * `migrate-lesson-placements.ts`) is the only placement source every reader
 * and writer uses.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole
 * schema and offers to truncate `docs` (6917 embedding rows) over unrelated
 * pre-existing drift. Every statement here is safe to re-run.
 *
 * DEPLOYMENT ORDERING: `lessons.module_id` is `.notNull()` in schema.ts as of
 * this task's code, but this migration is what actually drops it from the
 * table. If the code that stopped writing `lessons.module_id`
 * (`createLesson`) deploys before this migration runs, every lesson-create
 * INSERT starts omitting a NOT NULL column and fails outright. This
 * migration and that code change MUST land together — see the task 7 report
 * for where that constraint is (not yet) enforced elsewhere in the repo.
 *
 * Run: pnpm db:migrate-drop-lesson-module-id
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

export async function migrateDropLessonModuleId(): Promise<void> {
  // Refuse to drop anything while any lesson would be orphaned by it — a
  // lesson with a `module_id` but no `module_lessons` row. This is the last
  // moment the data can be checked cheaply, before the columns that would
  // let us recover are gone.
  const { rows } = await db.execute<{ n: number }>(sql`
    select count(*)::int as "n"
    from "lessons" l
    left join "module_lessons" ml on ml."lesson_id" = l."id"
    where ml."id" is null and l."module_id" is not null;
  `);
  const n = rows[0]?.n ?? 0;
  if (n > 0) {
    throw new Error(
      `${n} lesson(s) still have module_id but no placement. ` +
        `Re-run pnpm db:migrate-lesson-placements first.`,
    );
  }

  console.info('Dropping lessons.module_id and lessons.rank…');
  await db.execute(
    sql`alter table "lessons" drop column if exists "module_id";`,
  );
  await db.execute(sql`alter table "lessons" drop column if exists "rank";`);

  console.info('Dropping the old lesson_dependencies GIN index and table…');
  await db.execute(
    sql`drop index if exists "idx_lesson_dependencies_depends_on";`,
  );
  await db.execute(sql`drop table if exists "lesson_dependencies";`);

  console.info('Creating module_lessons_depends_on_idx (GIN)…');
  await db.execute(sql`
    create index if not exists "module_lessons_depends_on_idx"
      on "module_lessons" using gin ("depends_on");
  `);

  console.info('Done.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDropLessonModuleId()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
