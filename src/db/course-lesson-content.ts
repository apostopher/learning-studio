import { and, asc, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { db } from '#/db';
import { courseModuleIds } from '#/db/course-modules';
import type { LessonMaterial } from '#/db/lesson';
import {
  courseLessonVersionsTable,
  courseModulesTable,
  lessonsTable,
  lessonVersionsTable,
  moduleLessonsTable,
  modulesTable,
} from '#/db/schema';

/**
 * A lesson's content AS ONE COURSE HAS IT: the snapshot the course is pinned
 * to. Nothing here falls back to the working copy (`lessons`,
 * `lesson_material`): a lesson the course does not show, or shows without a
 * pin, answers null.
 */
export async function getPinnedSnapshot(lessonSlug: string, courseId: number) {
  const [row] = await db
    .select(getTableColumns(lessonVersionsTable))
    .from(lessonsTable)
    // Membership too: a pin can outlive the lesson's place in the course.
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(
      courseLessonVersionsTable,
      and(
        eq(courseLessonVersionsTable.courseId, courseId),
        eq(courseLessonVersionsTable.lessonId, lessonsTable.id),
      ),
    )
    .innerJoin(
      lessonVersionsTable,
      eq(lessonVersionsTable.id, courseLessonVersionsTable.lessonVersionId),
    )
    .where(
      and(
        eq(lessonsTable.slug, lessonSlug),
        inArray(moduleLessonsTable.moduleId, courseModuleIds(courseId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type PinnedSnapshot = NonNullable<
  Awaited<ReturnType<typeof getPinnedSnapshot>>
>;

export async function getPinnedVersionId(
  lessonSlug: string,
  courseId: number,
): Promise<number | null> {
  return (await getPinnedSnapshot(lessonSlug, courseId))?.id ?? null;
}

/**
 * The learner's material, in the shape of the working copy's
 * (`getLessonMaterial`). Null when the snapshot has none. Throws when the read
 * fails, so that an outage never reads as "no material".
 */
export async function getCourseLessonMaterial(
  lessonSlug: string,
  courseId: number,
): Promise<LessonMaterial | null> {
  const snapshot = await getPinnedSnapshot(lessonSlug, courseId);
  if (!snapshot || snapshot.text === null) return null;
  // Named one by one: a learner gets this whole object, and never the version.
  return {
    id: snapshot.id,
    lessonSlug,
    text: snapshot.text,
    keyPoints: snapshot.keyPoints,
    quiz: snapshot.quiz,
    proTips: snapshot.proTips,
    links: snapshot.links,
    assignments: snapshot.assignments,
    jobOfTheDay: snapshot.jobOfTheDay,
    testThis: snapshot.testThis,
    extraTab: snapshot.extraTab,
    createdAt: snapshot.createdAt,
    // Frozen: it was last updated when it was made.
    updatedAt: snapshot.createdAt,
  };
}

/**
 * The course whose credentials fetch a snapshot's transcript: lowest pinned
 * course owning a module with the lesson, else lowest pinned course. One per
 * version, not the course being served: two courses on one version must build
 * the same debrief, or each would regenerate the other's key points. Null
 * when no course shows the version.
 */
export async function getHomeCourseIdForVersion(
  versionId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ courseId: courseLessonVersionsTable.courseId })
    .from(courseLessonVersionsTable)
    .innerJoin(
      courseModulesTable,
      eq(courseModulesTable.courseId, courseLessonVersionsTable.courseId),
    )
    .innerJoin(
      moduleLessonsTable,
      and(
        eq(moduleLessonsTable.moduleId, courseModulesTable.moduleId),
        eq(moduleLessonsTable.lessonId, courseLessonVersionsTable.lessonId),
      ),
    )
    .innerJoin(modulesTable, eq(modulesTable.id, courseModulesTable.moduleId))
    .where(eq(courseLessonVersionsTable.lessonVersionId, versionId))
    .orderBy(
      desc(eq(modulesTable.courseId, courseLessonVersionsTable.courseId)),
      asc(courseLessonVersionsTable.courseId),
    )
    .limit(1);
  return row?.courseId ?? null;
}
