import { and, eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import {
  courseLessonVisibilityTable,
  courseModulesTable,
  coursesTable,
  moduleLessonsTable,
  modulesTable,
} from '#/db/schema';

/**
 * Show a lesson to a course's learners, or hide it from them. The answer stays
 * when the lesson is removed, so one removed and added back for an update comes
 * back as it was.
 *
 * Only for a lesson in one of the course's OWN modules; false otherwise. A
 * borrowed one is its owner's to show or hide (`lessonVisible`).
 */
export async function setLessonVisibility(input: {
  courseId: number;
  lessonId: number;
  isVisible: boolean;
}): Promise<boolean> {
  const { courseId, lessonId, isVisible } = input;
  // Every course showing one of those modules: this one and its borrowers.
  const showing = await db
    .selectDistinct({ slug: coursesTable.slug })
    .from(moduleLessonsTable)
    .innerJoin(
      modulesTable,
      and(
        eq(modulesTable.id, moduleLessonsTable.moduleId),
        eq(modulesTable.courseId, courseId),
      ),
    )
    .innerJoin(
      courseModulesTable,
      eq(courseModulesTable.moduleId, modulesTable.id),
    )
    .innerJoin(coursesTable, eq(coursesTable.id, courseModulesTable.courseId))
    .where(eq(moduleLessonsTable.lessonId, lessonId));
  if (showing.length === 0) return false;

  await db
    .insert(courseLessonVisibilityTable)
    .values({ courseId, lessonId, isVisible })
    .onConflictDoUpdate({
      target: [
        courseLessonVisibilityTable.courseId,
        courseLessonVisibilityTable.lessonId,
      ],
      set: { isVisible, updatedAt: sql`now()` },
    });
  await Promise.all(
    showing.map(({ slug }) => invalidateCourseDetailsCache(slug)),
  );
  return true;
}
