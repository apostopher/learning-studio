import { and, countDistinct, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { db } from '#/db';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import { courseModuleIds } from '#/db/course-modules';
import {
  getCourseIdForModuleId,
  getCourseSlugForModuleId,
  lessonBelongsToCourseOrg,
} from '#/db/lesson-access';
import {
  courseModulesTable,
  moduleLessonsTable,
  modulesTable,
} from '#/db/schema';
import type { CourseLessonDependency } from '#/types';

/** One lesson's position inside one module. */
export type Placement = {
  id: number;
  moduleId: number;
  lessonId: number;
  rank: number;
  dependsOn: CourseLessonDependency[];
};

/**
 * Every placement in a course, across all its modules, in rank order.
 *
 * "Its modules" means the ones `course_modules` places in it — the single
 * definition of membership (`courseModuleIds`) — not the ones whose
 * `modules.course_id` names it. Today the two agree; the point of asking the
 * helper is that they stay agreeing once a module can be placed in a course
 * it is not owned by.
 */
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
    .where(inArray(moduleLessonsTable.moduleId, courseModuleIds(courseId)))
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
 * A MEMBERSHIP question, so it is answered through `course_modules` — the
 * courses the lesson's modules are placed in — not `modules.course_id`,
 * which names a module's owner. The two agree today; they stop agreeing the
 * day a module is placed in a course it is not owned by, and the callers
 * here (the playback cache's per-course eviction, the admin routes'
 * "is this lesson placed anywhere / in this course" checks) all need the
 * membership answer.
 *
 * Plural on purpose: a lesson can be in several courses, and there is no
 * "the" course to infer. Callers that guard a mutation must decide what
 * several courses means — see the plan's "Editing a lesson becomes an
 * org-level permission". Empty means unplaced.
 */
export async function getCourseIdsForLesson(
  lessonId: number,
): Promise<number[]> {
  const rows = await db
    .select({ courseId: courseModulesTable.courseId })
    .from(moduleLessonsTable)
    .innerJoin(
      courseModulesTable,
      eq(courseModulesTable.moduleId, moduleLessonsTable.moduleId),
    )
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

  // Membership, same as `getCourseIdsForLesson` — a badge that counted
  // owners would say "in 1 course" for a lesson whose module is placed in two.
  const rows = await db
    .select({
      lessonId: moduleLessonsTable.lessonId,
      n: countDistinct(courseModulesTable.courseId),
    })
    .from(moduleLessonsTable)
    .innerJoin(
      courseModulesTable,
      eq(courseModulesTable.moduleId, moduleLessonsTable.moduleId),
    )
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
 * Move ONE placement — the `(fromModuleId, lessonId)` row — to another module
 * of the same owner, or to another slot in the same one. The placement row
 * keeps its identity; only its module and rank change.
 *
 * IMPORTANT: a placement is one `(module, lesson)` row, shared by every
 * course that shows the module, and a lesson can have many placements — one
 * per module teaching it, across courses and, after a remix, within one
 * course too (its own module and a borrowed one). The UPDATE below must
 * therefore never key off `lessonId` alone: that matched every placement of
 * the lesson, and with two of them in reach the unique (module_id, lesson_id)
 * index turned the drag into a 500. The WHERE pins:
 *
 * - `module_id = fromModuleId` — exactly the placement the drag started on;
 * - `module_id in (modules OWNED by the target's owner)` — the OWNERSHIP
 *   scope, not membership. Membership (`courseModuleIds`) includes modules a
 *   course merely borrows, so a remixer could name its own module as the
 *   target and pull a lesson out of a borrowed one, changing the owner's
 *   course everywhere it is shown (spec, Permissions row 2: adding or
 *   removing a module's lessons is the OWNER's authority). Under the owned
 *   scope such a row is unreachable: the write returns null and the route
 *   404s — after its own guard on the source's owner has had the chance to
 *   403 first.
 *
 * The owner filter is a `sql` fragment rather than a builder subquery, the
 * way `unremixCourse` writes its owner filter: it is over the OWNER column,
 * which has no membership-style helper, and a fragment renders standalone so
 * the WHERE can be pinned as text.
 */
export async function movePlacement(input: {
  lessonId: number;
  fromModuleId: number;
  targetModuleId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
}): Promise<Placement | null> {
  const ownerCourseId = await getCourseIdForModuleId(input.targetModuleId);
  if (ownerCourseId === null) return null;

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
        eq(moduleLessonsTable.moduleId, input.fromModuleId),
        eq(moduleLessonsTable.lessonId, input.lessonId),
        sql`${moduleLessonsTable.moduleId} in (select ${modulesTable.id} from ${modulesTable} where ${modulesTable.courseId} = ${ownerCourseId})`,
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
