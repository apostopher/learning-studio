import { countDistinct, eq, inArray } from 'drizzle-orm';
import { db } from '#/db';
import { moduleLessonsTable, modulesTable } from '#/db/schema';
import type { CourseLessonDependency } from '#/types';

/** One lesson's position inside one module. */
export type Placement = {
  id: number;
  moduleId: number;
  lessonId: number;
  rank: number;
  dependsOn: CourseLessonDependency[];
};

/** Every placement in a course, across all its modules, in rank order. */
export async function getPlacementsForCourse(
  courseId: number,
): Promise<Placement[]> {
  const rows = await db
    .select({
      id: moduleLessonsTable.id,
      moduleId: moduleLessonsTable.moduleId,
      lessonId: moduleLessonsTable.lessonId,
      rank: moduleLessonsTable.rank,
      dependsOn: moduleLessonsTable.dependsOn,
    })
    .from(moduleLessonsTable)
    .innerJoin(modulesTable, eq(moduleLessonsTable.moduleId, modulesTable.id))
    .where(eq(modulesTable.courseId, courseId))
    .orderBy(moduleLessonsTable.rank);

  return rows.map((r) => ({
    id: r.id,
    moduleId: r.moduleId,
    lessonId: r.lessonId,
    // `numeric` arrives as a string from pg; every consumer sorts on it.
    rank: Number(r.rank),
    dependsOn: (r.dependsOn ?? []) as CourseLessonDependency[],
  }));
}

/**
 * Every course teaching a lesson.
 *
 * Replaces the single-course answer `getCourseIdForLessonId` used to give.
 * Callers that guard a mutation must decide what several courses means — see
 * the plan's "Editing a lesson becomes an org-level permission".
 */
export async function getCourseIdsForLesson(
  lessonId: number,
): Promise<number[]> {
  const rows = await db
    .select({ courseId: modulesTable.courseId })
    .from(moduleLessonsTable)
    .innerJoin(modulesTable, eq(moduleLessonsTable.moduleId, modulesTable.id))
    .where(eq(moduleLessonsTable.lessonId, lessonId));

  return [...new Set(rows.map((r) => r.courseId))];
}

/**
 * How many distinct courses teach each of these lessons — the library card's
 * "in N courses" badge.
 */
export async function getCourseCountsForLessons(
  lessonIds: number[],
): Promise<Map<number, number>> {
  if (lessonIds.length === 0) return new Map();

  const rows = await db
    .select({
      lessonId: moduleLessonsTable.lessonId,
      n: countDistinct(modulesTable.courseId),
    })
    .from(moduleLessonsTable)
    .innerJoin(modulesTable, eq(moduleLessonsTable.moduleId, modulesTable.id))
    .where(inArray(moduleLessonsTable.lessonId, lessonIds))
    .groupBy(moduleLessonsTable.lessonId);

  return new Map(rows.map((r) => [r.lessonId, Number(r.n)]));
}
