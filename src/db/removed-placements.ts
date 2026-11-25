import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { Tx } from '#/db/lesson-versions';
import { lessonsTable, removedPlacementsTable } from '#/db/schema';
import type { CourseLessonDependency } from '#/types';

/** False on a database `migrate-lesson-versions` has not brought up to date. */
async function removedPlacementsExist(tx: Tx): Promise<boolean> {
  const { rows } = await tx.execute<{ exists: boolean }>(
    sql`select to_regclass('removed_placements') is not null as "exists"`,
  );
  return rows[0].exists;
}

/** Keep what a placement held, for `takeRemovedPlacement`. */
export async function rememberPlacement(
  tx: Tx,
  placement: Pick<
    typeof removedPlacementsTable.$inferInsert,
    'moduleId' | 'lessonId' | 'rank' | 'dependsOn'
  >,
): Promise<void> {
  if (!(await removedPlacementsExist(tx))) return;
  const { rank, dependsOn } = placement;
  await tx
    .insert(removedPlacementsTable)
    .values(placement)
    .onConflictDoUpdate({
      target: [
        removedPlacementsTable.moduleId,
        removedPlacementsTable.lessonId,
      ],
      set: { rank, dependsOn, removedAt: sql`now()` },
    });
}

/**
 * What the lesson's placement in this module held when it was last removed, to
 * be given to the new one; null when it never was. Only to this module: a rank
 * means nothing in another.
 *
 * Prerequisites on a lesson since deleted are left out, as `deleteLesson` does
 * for placements. One merely absent from the course is kept: it may be away
 * for its own update, and the gate skips it meanwhile.
 *
 * Another lesson may have been dropped on the old rank: then right after it.
 */
export async function takeRemovedPlacement(
  tx: Tx,
  moduleId: number,
  lessonId: number,
): Promise<{ rank: SQL; dependsOn: CourseLessonDependency[] } | null> {
  if (!(await removedPlacementsExist(tx))) return null;
  const [removed] = await tx
    .delete(removedPlacementsTable)
    .where(
      and(
        eq(removedPlacementsTable.moduleId, moduleId),
        eq(removedPlacementsTable.lessonId, lessonId),
      ),
    )
    .returning();
  if (!removed) return null;

  const slugs = removed.dependsOn.map((d) => d.lessonSlug);
  const alive =
    slugs.length === 0
      ? []
      : await tx
          .select({ slug: lessonsTable.slug })
          .from(lessonsTable)
          .where(inArray(lessonsTable.slug, slugs));
  const aliveSlugs = new Set(alive.map((l) => l.slug));

  const rank = sql`${removed.rank}::numeric`;
  const ranks = sql`select ml."rank" from "module_lessons" ml where ml."module_id" = ${moduleId}`;
  return {
    rank: sql`case when ${rank} in (${ranks})
      then coalesce((${rank} + (select min(r."rank") from (${ranks}) r where r."rank" > ${rank})) / 2, ${rank} + 1)
      else ${rank} end`,
    dependsOn: removed.dependsOn.filter((d) => aliveSlugs.has(d.lessonSlug)),
  };
}
