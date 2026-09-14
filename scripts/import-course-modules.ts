/**
 * The modules phase of `import-course.ts`, split out (like
 * `resolve-course-org-link.ts`) so it can be unit-tested with a fake `q` —
 * `import-course.ts` itself constructs live `pg.Pool`s and runs `main()` at
 * import time, so importing it in a test would open a real connection.
 *
 * Targets the post-`course_modules` schema (`migrate-course-modules.ts`,
 * then `migrate-drop-module-rank.ts`): `modules.rank` is gone, and a
 * module's position in a course lives on its `course_modules` placement.
 * `modules.course_id` is OWNERSHIP only — which modules a course SHOWS is
 * `course_modules`, the single definition of membership every reader goes
 * through (`courseModuleIds`, `src/db/course-modules.ts`).
 *
 * Raw `pg` SQL, invisible to tsc — the test next to this file reads the
 * statements handed to `q`, because nothing else would catch a stray
 * `rank=` on the `modules` write once the column is dropped.
 */

type Q = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>;

/** One `modules` row as the OLD (pre-contract) database still hands it over. */
export type OldModuleRow = {
  name: string;
  slug: string;
  required_subscriptions: string[];
  /** `numeric` — kept as a string end to end so no decimals are lost. */
  rank: string;
  created_at: Date;
  updated_at: Date;
};

/**
 * Upsert each source module (natural key: slug) under `courseId`, then
 * upsert its placement in that course at the source rank. Both writes
 * upsert, so a re-run resumes: a crash between a module write and its
 * placement leaves one unplaced module that the next run places.
 *
 * The placement write is what makes the module VISIBLE — the board, the
 * learner rail and `migrate-drop-module-rank.ts`'s orphan gate all read
 * `course_modules`, never `modules.course_id`. A module row with no
 * placement is an orphan nothing shows.
 */
export async function upsertCourseModules(
  q: Q,
  courseId: number,
  oldModules: readonly OldModuleRow[],
): Promise<{
  moduleIdBySlug: Map<string, number>;
  inserted: number;
  updated: number;
}> {
  const moduleIdBySlug = new Map<string, number>();
  let inserted = 0;
  let updated = 0;
  for (const row of oldModules) {
    const [existing] = await q<{ id: number }>(
      `select id from modules where slug = $1`,
      [row.slug],
    );
    let moduleId: number;
    if (existing) {
      await q(
        `update modules set course_id=$2, name=$3, required_subscriptions=$4, updated_at=$5 where id=$1`,
        [
          existing.id,
          courseId,
          row.name,
          row.required_subscriptions,
          row.updated_at,
        ],
      );
      moduleId = existing.id;
      updated++;
    } else {
      const [ins] = await q<{ id: number }>(
        `insert into modules (course_id, name, slug, required_subscriptions, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [
          courseId,
          row.name,
          row.slug,
          row.required_subscriptions,
          row.created_at,
          row.updated_at,
        ],
      );
      if (!ins) {
        throw new Error(
          `insert into modules returned no row for slug ${row.slug}`,
        );
      }
      moduleId = ins.id;
      inserted++;
    }
    moduleIdBySlug.set(row.slug, moduleId);

    // Placement in THIS course, at the source rank. `on conflict … do update`
    // (not `do nothing`) so a re-run after the source was reordered moves
    // the module rather than leaving the first import's order in place.
    await q(
      `insert into course_modules (course_id, module_id, rank) values ($1,$2,$3)
         on conflict (course_id, module_id) do update set rank = excluded.rank`,
      [courseId, moduleId, row.rank],
    );
  }
  return { moduleIdBySlug, inserted, updated };
}

/**
 * Every module id placed in `courseId` IN THE DESTINATION — the same
 * answer `courseModuleIds` (`src/db/course-modules.ts`) gives the app,
 * expressed as raw SQL because this script talks to `pg` directly.
 */
export async function selectCourseModuleIds(
  q: Q,
  courseId: number,
): Promise<number[]> {
  const rows = await q<{ module_id: number }>(
    `select module_id from course_modules where course_id = $1`,
    [courseId],
  );
  return rows.map((r) => r.module_id);
}
