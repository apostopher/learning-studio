/**
 * Contract migration: drop `lessons.module_id`, `lessons.rank` and
 * `lesson_dependencies` now that `module_lessons` (Task 5/6,
 * `migrate-lesson-placements.ts`) is the only placement source every reader
 * and writer uses.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole
 * schema and offers to truncate `docs` (6917 embedding rows) over unrelated
 * pre-existing drift. Every statement here is safe to re-run — including
 * the orphan gate itself: it probes `information_schema.columns` for
 * `lessons.module_id` FIRST, since (unlike the DDL below, which all uses
 * `if exists`) a `where l."module_id" is not null` on a database that has
 * already had the column dropped isn't something `if exists` can guard —
 * Postgres raises `column l.module_id does not exist` and the whole script
 * would exit 1 on a second run otherwise.
 *
 * DEPLOYMENT ORDERING: relax first, then deploy, then run this. See
 * `docs/deploy-lessons-module-id-drop.md` for the full runbook and why
 * there is no ordering that skips the relax step — `migrate-relax-lesson
 * -columns.ts` (`pnpm db:relax-lesson-columns`) drops the `NOT NULL`
 * constraint on `module_id` AND `rank` ahead of the code deploy, which is
 * what actually closes the window (deploying the code first, or running
 * this contract migration first, both 500 on a live admin action until the
 * other half lands — relaxing both constraints is backward-compatible with
 * both the old and new code, so it's the one step that removes the window
 * rather than just choosing which side gets to fail).
 *
 * Run: pnpm db:migrate-drop-lesson-module-id
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

export async function migrateDropLessonModuleId(): Promise<void> {
  await db.transaction(async (tx) => {
    // Postgres DDL is transactional, so wrapping every statement in one
    // transaction turns "failed partway between the column drops and the
    // new index" into a non-state: either everything below lands, or
    // nothing does, and a re-run always sees a database in one of the two
    // clean states this function already knows how to handle.
    const { rows: cols } = await tx.execute<{ n: number }>(sql`
      select count(*)::int as "n"
      from information_schema.columns
      where table_schema = 'public' and table_name = 'lessons'
        and column_name = 'module_id';
    `);
    const moduleIdStillExists = (cols[0]?.n ?? 0) > 0;

    if (moduleIdStillExists) {
      // Refuse to drop anything while any lesson would be orphaned by it —
      // a lesson with a `module_id` but no `module_lessons` row. This is
      // the last moment the data can be checked cheaply, before the
      // columns that would let us recover are gone.
      const { rows } = await tx.execute<{ n: number }>(sql`
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

      console.info('Dropping lessons.module_id…');
      await tx.execute(
        sql`alter table "lessons" drop column if exists "module_id";`,
      );
    } else {
      console.info('lessons.module_id already dropped — orphan gate skipped.');
    }

    // Deliberately OUTSIDE the branch above: `module_id` and `rank` are two
    // independently `if exists`-guarded statements that never needed to be
    // coupled. Nested inside the `moduleIdStillExists` branch (fix round 1's
    // shape), a database with `module_id` already gone but `rank` still
    // present would silently skip dropping `rank` too — the run would still
    // report "Done" while `createLesson` (which stopped writing `rank`
    // alongside `module_id`) stays broken against a column that's still
    // NOT NULL.
    console.info('Dropping lessons.rank…');
    await tx.execute(sql`alter table "lessons" drop column if exists "rank";`);

    console.info('Dropping the old lesson_dependencies GIN index and table…');
    await tx.execute(
      sql`drop index if exists "idx_lesson_dependencies_depends_on";`,
    );
    await tx.execute(sql`drop table if exists "lesson_dependencies";`);

    console.info('Creating module_lessons_depends_on_idx (GIN)…');
    await tx.execute(sql`
      create index if not exists "module_lessons_depends_on_idx"
        on "module_lessons" using gin ("depends_on");
    `);
  });

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
