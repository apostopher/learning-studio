import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { courseModulesTable } from '#/db/schema';

/**
 * The module ids a course shows, as a SUBQUERY.
 *
 * The single definition of membership. Every read that asks "which modules are
 * in this course" goes through this or `getCourseModuleIds` — two definitions
 * is how a rail comes to show a module that `lesson-access` says is not in the
 * course, which shows the learner a lesson and then refuses it on click.
 *
 * A subquery rather than an awaited array so callers keep one round trip.
 */
export function courseModuleIds(courseId: number) {
  return db
    .select({ id: courseModulesTable.moduleId })
    .from(courseModulesTable)
    .where(eq(courseModulesTable.courseId, courseId));
}

/** The same answer, resolved — for callers that need the ids in JS. */
export async function getCourseModuleIds(courseId: number): Promise<number[]> {
  const rows = await db
    .select({ id: courseModulesTable.moduleId })
    .from(courseModulesTable)
    .where(eq(courseModulesTable.courseId, courseId));
  return rows.map((r) => r.id);
}
