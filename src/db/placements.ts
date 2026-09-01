import { and, countDistinct, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { db } from '#/db';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import {
  getCourseIdForModuleId,
  getCourseSlugForModuleId,
  lessonBelongsToCourseOrg,
} from '#/db/lesson-access';
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

/**
 * Midpoint rank between two neighbours, matching `moveLesson`'s scheme:
 * halve to go first, +1 to go last, 1 into an empty module. Computed in SQL so
 * Postgres `numeric` does the arithmetic and no precision is lost in JS.
 */
function rankBetween(
  prevLessonId: number | null,
  nextLessonId: number | null,
  moduleId: number,
): SQL {
  const rankOf = (lessonId: number) =>
    sql`(select ${moduleLessonsTable.rank} from ${moduleLessonsTable}
         where ${moduleLessonsTable.lessonId} = ${lessonId}
           and ${moduleLessonsTable.moduleId} = ${moduleId})`;

  const prev = prevLessonId ? rankOf(prevLessonId) : null;
  const next = nextLessonId ? rankOf(nextLessonId) : null;

  if (prev && next) return sql`(${prev} + ${next}) / 2`;
  if (next) return sql`${next} / 2`;
  if (prev) return sql`${prev} + 1`;
  return sql`1`;
}

function toPlacement(row: {
  id: number;
  moduleId: number;
  lessonId: number;
  rank: unknown;
  dependsOn: unknown;
}): Placement {
  return {
    id: row.id,
    moduleId: row.moduleId,
    lessonId: row.lessonId,
    rank: Number(row.rank),
    dependsOn: (row.dependsOn ?? []) as CourseLessonDependency[],
  };
}

/** Every module id belonging to a course — used to scope a write to that course. */
async function getModuleIdsForCourse(courseId: number): Promise<number[]> {
  const rows = await db
    .select({ id: modulesTable.id })
    .from(modulesTable)
    .where(eq(modulesTable.courseId, courseId));
  return rows.map((r) => r.id);
}

/**
 * Place an existing library lesson into a module.
 *
 * Returns `null` when `moduleId` doesn't resolve to a course — the module
 * doesn't exist. Returns `'duplicate'` when it does, but the target course
 * already teaches this lesson: one placement per course keeps completion
 * unambiguous, and the caller turns this into an explanation rather than an
 * error. These two must stay distinguishable: Task 9 maps `null` to a 404
 * ("no such module") and `'duplicate'` to a 409 ("already in this course") —
 * collapsing them back into one sentinel would report 409 for a dangling
 * module id, which is a lie.
 *
 * The unique index only covers (module_id, lesson_id), so the course-level rule
 * is checked here. A denormalised course_id on module_lessons would make it a
 * DB guarantee; not worth it until this check proves insufficient.
 */
export async function linkLesson(input: {
  moduleId: number;
  lessonId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
}): Promise<Placement | 'duplicate' | 'foreign-lesson' | null> {
  const targetCourseId = await getCourseIdForModuleId(input.moduleId);
  if (targetCourseId === null) return null;

  // Before anything is written. The caller's guard proved authority over the
  // destination module; this is the only thing that says the LESSON may go
  // there. See `lessonBelongsToCourseOrg`.
  if (!(await lessonBelongsToCourseOrg(input.lessonId, targetCourseId))) {
    return 'foreign-lesson';
  }

  const existing = await getCourseIdsForLesson(input.lessonId);
  if (existing.includes(targetCourseId)) return 'duplicate';

  const [created] = await db
    .insert(moduleLessonsTable)
    .values({
      moduleId: input.moduleId,
      lessonId: input.lessonId,
      rank: rankBetween(input.prevLessonId, input.nextLessonId, input.moduleId),
      dependsOn: [],
    })
    .returning({
      id: moduleLessonsTable.id,
      moduleId: moduleLessonsTable.moduleId,
      lessonId: moduleLessonsTable.lessonId,
      rank: moduleLessonsTable.rank,
      dependsOn: moduleLessonsTable.dependsOn,
    });

  await invalidateCourseDetailsCache(
    await getCourseSlugForModuleId(input.moduleId),
  );

  return toPlacement(created);
}

/** Remove a placement. The lesson itself survives, in the library and elsewhere. */
export async function unlinkLesson(
  moduleId: number,
  lessonId: number,
): Promise<boolean> {
  const removed = await db
    .delete(moduleLessonsTable)
    .where(
      and(
        eq(moduleLessonsTable.moduleId, moduleId),
        eq(moduleLessonsTable.lessonId, lessonId),
      ),
    )
    .returning({ id: moduleLessonsTable.id });

  if (removed.length === 0) return false;

  await invalidateCourseDetailsCache(await getCourseSlugForModuleId(moduleId));
  return true;
}

/**
 * Move a placement within its course — to another module, or to another slot
 * in the same one. The placement row keeps its identity; only its module and
 * rank change.
 *
 * IMPORTANT: a lesson has one placement per COURSE, but it can have many
 * placements ACROSS courses — that's the entire point of the shared library.
 * The UPDATE below must therefore never key off `lessonId` alone: doing so
 * would match every course teaching this lesson and silently rewrite the
 * module/rank of placements the caller never asked to touch. It is scoped to
 * `targetModuleId`'s own course by resolving that course's module ids first
 * and requiring the placement's `moduleId` to be one of them.
 */
export async function movePlacement(input: {
  lessonId: number;
  targetModuleId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
}): Promise<Placement | null> {
  const targetCourseId = await getCourseIdForModuleId(input.targetModuleId);
  if (targetCourseId === null) return null;

  const courseModuleIds = await getModuleIdsForCourse(targetCourseId);

  const [updated] = await db
    .update(moduleLessonsTable)
    .set({
      moduleId: input.targetModuleId,
      rank: rankBetween(
        input.prevLessonId,
        input.nextLessonId,
        input.targetModuleId,
      ),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(moduleLessonsTable.lessonId, input.lessonId),
        inArray(moduleLessonsTable.moduleId, courseModuleIds),
      ),
    )
    .returning({
      id: moduleLessonsTable.id,
      moduleId: moduleLessonsTable.moduleId,
      lessonId: moduleLessonsTable.lessonId,
      rank: moduleLessonsTable.rank,
      dependsOn: moduleLessonsTable.dependsOn,
    });

  if (!updated) return null;

  await invalidateCourseDetailsCache(
    await getCourseSlugForModuleId(input.targetModuleId),
  );

  return toPlacement(updated);
}
