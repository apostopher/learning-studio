/**
 * Find every `module_lessons` placement a lesson already has WITHIN one
 * course's modules, healing a pre-existing DUPLICATE (more than one row)
 * before returning the surviving placement's id — or `null` if the lesson
 * has no placement in this course yet.
 *
 * Two placement rows for one lesson in one course violates the invariant
 * `movePlacement` (`src/db/placements.ts`) relies on — its own UPDATE would
 * hit both and collide with the unique index. A duplicate could only exist
 * from a prior run of `import-course.ts` before the bug that could create
 * one (fix round 2's Important 3, fixed for real in round 4's Important 1)
 * was closed — this function is what repairs one if a re-run finds it,
 * rather than leaving it for whichever row an unordered read happened to
 * return first.
 *
 * Kept: the lowest-id row (the original placement). Deleted: every other
 * one, via `delete ... returning module_id, rank, depends_on` — NOT just
 * the ids — so the caller can log the FULL content of what was removed
 * (fix round 5, Minor 1). This is the only destructive statement in the
 * entire importer, and it is new in this branch: a deleted row's
 * `depends_on` may hold per-course prerequisites an admin authored by hand
 * that the SOURCE database has no `lesson_dependencies` row for at all —
 * logging only ids would make that content gone with no record at commit.
 *
 * ORDER MATTERS, and it is why this is a separate step from the caller's
 * own move/insert: the delete here runs BEFORE the caller updates the
 * surviving row to its new module/rank. Deleting the extras FIRST is what
 * keeps that later UPDATE's target `(module_id, lesson_id)` pair from ever
 * colliding with a row that's still present — updating the survivor first
 * and deleting after would risk that UPDATE itself hitting the unique
 * index, if one of the extras already sits in the target module.
 *
 * Split out of `import-course.ts` itself for the same reason `withNewTx`
 * and `resolveCourseOrgId` were: that file constructs live `pg.Pool`s and
 * runs its `main()` unconditionally at import time, so importing it
 * directly in a test would attempt a real database connection.
 */
export async function healDuplicatePlacements(
  q: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<T[]>,
  lessonId: number,
  courseModuleIds: number[],
  slug: string,
): Promise<number | null> {
  const existingPlacements = await q<{ id: number }>(
    `select id from module_lessons
       where lesson_id = $1 and module_id = any($2::int[])
       order by id`,
    [lessonId, courseModuleIds],
  );

  if (existingPlacements.length > 1) {
    const [survivor, ...extras] = existingPlacements;
    const deleted = await q<{
      module_id: number;
      rank: string;
      depends_on: unknown;
    }>(
      `delete from module_lessons where id = any($1::int[])
         returning module_id, rank, depends_on`,
      [extras.map((e) => e.id)],
    );
    console.log(
      `    healed duplicate placement(s) for "${slug}": kept id=${survivor.id}, ` +
        `deleted [${extras.map((e) => e.id).join(', ')}] — full contents removed: ` +
        JSON.stringify(deleted),
    );
  }

  return existingPlacements[0]?.id ?? null;
}
