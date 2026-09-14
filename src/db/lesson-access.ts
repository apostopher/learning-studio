import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#/db';
import { courseModuleIds } from '#/db/course-modules';
import {
  courseModulesTable,
  courseOrgsTable,
  courseSubscriptionsTable,
  coursesTable,
  lessonsTable,
  moduleLessonsTable,
  modulesTable,
} from '#/db/schema';

/**
 * A lesson as placed in ONE course, or null when the course does not exist or
 * the lesson is not placed in it.
 *
 * The course comes from the caller — ultimately the `/course/$courseSlug/…`
 * route the learner is on — and membership is checked through
 * `courseModuleIds`, the single definition of "which modules are in this
 * course". This replaces a lesson → module → course walk that picked the
 * lowest course id among those teaching the lesson: with a lesson in two
 * courses, that resolved a learner in the second against the first's tier
 * and subscription.
 *
 * `isAvailable` comes back rather than being filtered in SQL so the caller
 * decides what an unavailable (WIP) lesson means — `evaluateLessonGate` treats
 * it as "does not exist" on the learner path. Filtering here would make the
 * two cases indistinguishable to anyone debugging a 404.
 */
export async function getLessonInCourse({
  lessonSlug,
  courseSlug,
}: {
  lessonSlug: string;
  courseSlug: string;
}): Promise<{ courseId: number; isAvailable: boolean } | null> {
  const [course] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.slug, courseSlug))
    .limit(1);
  if (!course) return null;

  const [lesson] = await db
    .select({ isAvailable: lessonsTable.isAvailable })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .where(
      and(
        eq(lessonsTable.slug, lessonSlug),
        inArray(moduleLessonsTable.moduleId, courseModuleIds(course.id)),
      ),
    )
    .limit(1);
  if (!lesson) return null;
  return { courseId: course.id, isAvailable: lesson.isAvailable };
}

/**
 * EVERY course slug that teaches this lesson.
 *
 * A lesson reaches learners through `module_lessons`, so editing one lesson
 * can change what several courses show. Cache invalidation must therefore hit
 * all of them. Admin mutations only ever hold a `lessonId`, and the
 * course-details cache is keyed by course slug, so this is the lookup they
 * need before invalidating. There is deliberately no single-slug sibling: a
 * lesson has no "the" course, and the one that used to pick one (the lowest
 * id) left the other courses serving stale content.
 *
 * Membership, not ownership: the courses that teach a lesson are the courses
 * its module is PLACED in (`course_modules`), not the one that owns the module
 * (`modules.course_id`). Walking ownership gives the same answer only while
 * every module is placed solely in its owner; the first shared module would
 * leave the sharing course's cache stale on every edit.
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
    .innerJoin(
      courseModulesTable,
      eq(courseModulesTable.moduleId, moduleLessonsTable.moduleId),
    )
    .innerJoin(coursesTable, eq(coursesTable.id, courseModulesTable.courseId))
    .where(eq(lessonsTable.id, lessonId));
  return [...new Set(rows.map((r) => r.courseSlug))];
}

/**
 * EVERY course slug that SHOWS this module.
 *
 * Membership, not ownership — the same rationale as `getCourseSlugsForLessonId`
 * one level up: a module has one owner (`modules.course_id`) but sits on the
 * rail of every course that remixes the owner (`course_modules`), and each of
 * those courses caches its own learner payload with the module in it. An
 * admin write keyed on a module — creating a lesson in it, renaming it,
 * toggling its sequencing, changing its or its lessons' prerequisites,
 * deleting it, linking/unlinking/moving a placement in it — therefore
 * changes what every one of them serves, and the owner-only slug this
 * replaces left every remixer stale until the 6h TTL. There is deliberately
 * no single-slug sibling any more, for the same reason there is none for
 * lessons.
 *
 * Callers that delete the module must call this BEFORE the delete: the
 * cascade takes the `course_modules` rows with it, and afterwards nothing is
 * left to join.
 */
export async function getCourseSlugsForModuleId(
  moduleId: number,
): Promise<string[]> {
  const rows = await db
    .select({ courseSlug: coursesTable.slug })
    .from(courseModulesTable)
    .innerJoin(coursesTable, eq(coursesTable.id, courseModulesTable.courseId))
    .where(eq(courseModulesTable.moduleId, moduleId));
  return [...new Set(rows.map((r) => r.courseSlug))];
}

/**
 * A lesson's discipline, distinguishing "no such lesson" from "lesson exists
 * with no discipline" — the two cases the lesson-content guard
 * (`requireLessonContentPermission`) answers differently: a missing lesson is
 * a 404, a discipline-less ("Untitled") one is admin-only. A bare
 * `number | null` return cannot express both — its one `null` would have to
 * mean either "doesn't exist" or "exists, no discipline", collapsing exactly
 * the distinction the caller needs — so this returns a discriminated union
 * instead.
 */
export type LessonDisciplineLookup =
  | { found: false }
  | { found: true; disciplineId: number | null };

export async function getDisciplineIdForLessonId(
  lessonId: number,
): Promise<LessonDisciplineLookup> {
  const [row] = await db
    .select({ disciplineId: lessonsTable.disciplineId })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);
  if (!row) return { found: false };
  return { found: true, disciplineId: row.disciplineId };
}

/**
 * The course id a module belongs to — its OWNER, `modules.course_id`, which
 * is what admin authority over a module follows. Returns null (never throws)
 * when the module doesn't exist, so callers can tell "no such module" (404)
 * apart from a real query failure.
 *
 * A module has exactly one owner, so this single answer is honest. A LESSON
 * has no such thing — it is placed in any number of courses — which is why
 * there is no single-course sibling for lessons beside this:
 * `getCourseIdsForLesson` (placements.ts) answers the plural question, and
 * every caller decides for itself what several courses means.
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

/**
 * Is this lesson's owning org one of the orgs the target course belongs to?
 *
 * THE tenant boundary for placement, and the reason it exists: `lessons.id` is
 * a global serial, so a `lessonId` arriving in a request body is just an
 * integer. Guarding the MODULE — which `linkLesson`'s caller does, and which
 * establishes authority over the destination — says nothing at all about the
 * lesson being dragged in. Without this, anyone holding `structure:create` on
 * a course of their own could place any lesson in the database into it, and
 * every downstream reader would serve it: the board renders it, the learner
 * payload ships it, and `resolveLessonPlayback` resolves the foreign
 * `videoRef` against the DESTINATION course's provider credentials, so the
 * video plays.
 *
 * Expressed against `course_orgs` rather than `getActiveOrgId()` on purpose.
 * The question is not "does this lesson belong to the deployment's org" but
 * "does it belong to an org that owns the course it is being placed in" — and
 * a course may belong to several (`course_orgs` is a join table, and
 * `createLesson` resolves a lesson's single owner as the LOWEST of them). Only
 * the relationship between the two rows can answer that; ambient config
 * cannot.
 *
 * The mirror of `findDisciplineInOrg`, which does the same job for the other
 * global serial on this surface.
 */
export async function lessonBelongsToCourseOrg(
  lessonId: number,
  courseId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .innerJoin(courseOrgsTable, eq(courseOrgsTable.orgId, lessonsTable.orgId))
    .where(
      and(
        eq(lessonsTable.id, lessonId),
        eq(courseOrgsTable.courseId, courseId),
      ),
    )
    .limit(1);
  return row !== undefined;
}
