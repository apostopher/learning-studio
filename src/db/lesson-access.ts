import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseSubscriptionsTable,
  coursesTable,
  lessonsTable,
  moduleLessonsTable,
  modulesTable,
} from '#/db/schema';

/**
 * The course a lesson belongs to, or null when the lesson doesn't exist.
 *
 * A lesson can now be taught by SEVERAL courses via `module_lessons` — this
 * returns only ONE of them (the lowest course id, so the answer is stable
 * across calls rather than depending on row order). Callers that need every
 * course teaching this lesson want `getCourseIdsForLesson` (by id, ids only)
 * or `getCourseSlugsForLessonId` (by id, every slug) instead.
 *
 * `isAvailable` comes back rather than being filtered in SQL so the caller
 * decides what an unavailable (WIP) lesson means — `evaluateLessonGate` treats
 * it as "does not exist" on the learner path. Filtering here would make the
 * two cases indistinguishable to anyone debugging a 404.
 */
export async function getCourseSlugForLesson(lessonSlug: string): Promise<{
  courseSlug: string;
  courseId: number;
  isAvailable: boolean;
} | null> {
  const rows = await db
    .select({
      courseSlug: coursesTable.slug,
      courseId: coursesTable.id,
      isAvailable: lessonsTable.isAvailable,
    })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.slug, lessonSlug))
    .orderBy(modulesTable.courseId)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Course slug owning a lesson, resolved by numeric lesson id rather than
 * lesson slug. Admin mutations only ever hold a `lessonId`, and the
 * course-details cache is keyed by course slug, so this is the lookup they
 * need before invalidating. Returns null if the lesson doesn't exist.
 *
 * A lesson can now be taught by SEVERAL courses via `module_lessons` — this
 * returns only ONE of them (the lowest course id, so the answer is stable
 * across calls rather than depending on row order). A caller that must act on
 * EVERY course teaching this lesson — cache invalidation, in particular —
 * wants `getCourseSlugsForLessonId` instead; using this one there would leave
 * the other courses serving stale content.
 */
export async function getCourseSlugForLessonId(
  lessonId: number,
): Promise<string | null> {
  const [row] = await db
    .select({ courseSlug: coursesTable.slug })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.id, lessonId))
    .orderBy(modulesTable.courseId)
    .limit(1);
  return row?.courseSlug ?? null;
}

/**
 * EVERY course slug that teaches this lesson.
 *
 * A lesson reaches learners through `module_lessons`, so editing one lesson
 * can change what several courses show. Cache invalidation must therefore hit
 * all of them — `getCourseSlugForLessonId` returns only one and would leave
 * the rest serving stale content until the TTL expires.
 */
export async function getCourseSlugsForLessonId(
  lessonId: number,
): Promise<string[]> {
  const rows = await db
    .select({ courseSlug: coursesTable.slug })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.id, lessonId));
  return [...new Set(rows.map((r) => r.courseSlug))];
}

/**
 * Course slug owning a module, resolved by numeric module id. Same rationale
 * as `getCourseSlugForLessonId`: admin mutations on a module only hold its
 * id, not its course's slug.
 */
export async function getCourseSlugForModuleId(
  moduleId: number,
): Promise<string | null> {
  const [row] = await db
    .select({ courseSlug: coursesTable.slug })
    .from(modulesTable)
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(modulesTable.id, moduleId))
    .limit(1);
  return row?.courseSlug ?? null;
}

/**
 * The course id a lesson belongs to.
 *
 * The slug-returning siblings above exist for cache invalidation, which is
 * keyed by slug. Authorization is keyed by id, and round-tripping id → slug →
 * id would be two queries to answer one question. Returns null (never
 * throws) when the lesson doesn't exist, so callers can tell "no such
 * lesson" (404) apart from a real query failure.
 *
 * A lesson can now be taught by SEVERAL courses via `module_lessons` — this
 * returns only ONE of them (the lowest course id, so the answer is stable
 * across calls rather than depending on row order). See `getCourseIdsForLesson`
 * for callers that need every course a lesson belongs to.
 */
export async function getCourseIdForLessonId(
  lessonId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ courseId: coursesTable.id })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.id, lessonId))
    .orderBy(modulesTable.courseId)
    .limit(1);
  return row?.courseId ?? null;
}

/**
 * The course id a module belongs to. Returns null (never throws) when the
 * module doesn't exist — see `getCourseIdForLessonId` for why.
 */
export async function getCourseIdForModuleId(
  moduleId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ courseId: coursesTable.id })
    .from(modulesTable)
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(modulesTable.id, moduleId))
    .limit(1);
  return row?.courseId ?? null;
}

/** Course slug resolved directly by numeric course id. */
export async function getCourseSlugForCourseId(
  courseId: number,
): Promise<string | null> {
  const [row] = await db
    .select({ courseSlug: coursesTable.slug })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  return row?.courseSlug ?? null;
}

/** Whether the user holds a subscription row for the course. */
export async function isSubscribedToCourse(
  userId: string,
  courseId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: courseSubscriptionsTable.id })
    .from(courseSubscriptionsTable)
    .where(
      and(
        eq(courseSubscriptionsTable.userId, userId),
        eq(courseSubscriptionsTable.courseId, courseId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Whether the user holds a subscription for the course with this slug.
 *
 * A second small query (joined by slug) rather than a slug→id round trip
 * through `isSubscribedToCourse` — callers here (`getCourseContentForAgent`)
 * only ever have the slug, not the id, so this reads cleaner than resolving
 * one first.
 */
export async function isSubscribedToCourseSlug(
  userId: string,
  courseSlug: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: courseSubscriptionsTable.id })
    .from(courseSubscriptionsTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, courseSubscriptionsTable.courseId),
    )
    .where(
      and(
        eq(courseSubscriptionsTable.userId, userId),
        eq(coursesTable.slug, courseSlug),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Numeric id for a lesson slug, or null when no lesson has that slug.
 *
 * Bridges the client's `lessonSlug` to the `lesson_id` FK progress rows carry.
 * Callers must treat null as denied, not as open — the same contract every
 * lesson lookup in this file follows.
 */
export async function getLessonIdBySlug(slug: string): Promise<number | null> {
  const rows = await db
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .where(eq(lessonsTable.slug, slug))
    .limit(1);
  return rows[0]?.id ?? null;
}
