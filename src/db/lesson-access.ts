import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseSubscriptionsTable,
  coursesTable,
  lessonsTable,
  modulesTable,
} from '#/db/schema';

/**
 * The course a lesson belongs to, or null when the lesson doesn't exist.
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
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.slug, lessonSlug))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Course slug owning a lesson, resolved by numeric lesson id rather than
 * lesson slug. Admin mutations only ever hold a `lessonId`, and the
 * course-details cache is keyed by course slug, so this is the lookup they
 * need before invalidating. Returns null if the lesson doesn't exist.
 */
export async function getCourseSlugForLessonId(
  lessonId: number,
): Promise<string | null> {
  const [row] = await db
    .select({ courseSlug: coursesTable.slug })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);
  return row?.courseSlug ?? null;
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
 * The lesson a Synthesia video belongs to, so /api/lesson/video can apply the
 * same gates as the material route.
 *
 * KNOWN LIMITATION: matches `lessons.video_id` only. A lesson's
 * `other_video_ids` are not resolved, so a request for one of those IDs finds
 * no lesson. Callers must treat "no lesson" as denied, not as open, or this
 * becomes the bypass it was written to close.
 */
export async function getLessonByVideoId(videoId: string): Promise<{
  lessonSlug: string;
  courseSlug: string;
  courseId: number;
} | null> {
  const rows = await db
    .select({
      lessonSlug: lessonsTable.slug,
      courseSlug: coursesTable.slug,
      courseId: coursesTable.id,
    })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.videoId, videoId))
    .limit(1);
  return rows[0] ?? null;
}
