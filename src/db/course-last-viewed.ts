import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#/db';
import { courseModuleIds } from '#/db/course-modules';
import {
  courseLastViewedTable,
  coursesTable,
  lessonsTable,
  moduleLessonsTable,
} from '#/db/schema';

/**
 * The lesson id this user was last on in this course, or null when they have
 * never opened one (or the lesson has since been deleted, which `on delete
 * set null` reduces to the same thing).
 *
 * Returns an id rather than slugs because the FK is what keeps the pointer
 * honest — a stored slug would rot silently on rename. The caller resolves
 * id → slugs from the Redis-cached course payload it already needs.
 */
export async function getLastViewedLessonId({
  userId,
  courseSlug,
}: {
  userId: string;
  courseSlug: string;
}): Promise<number | null> {
  const [row] = await db
    .select({ lessonId: courseLastViewedTable.lessonId })
    .from(courseLastViewedTable)
    .innerJoin(
      coursesTable,
      eq(coursesTable.id, courseLastViewedTable.courseId),
    )
    .where(
      and(
        eq(courseLastViewedTable.userId, userId),
        eq(coursesTable.slug, courseSlug),
      ),
    )
    .limit(1);
  return row?.lessonId ?? null;
}

/**
 * Record that this user is on this lesson, in this course.
 *
 * The course is the one the caller resolved — the route's gate, from the
 * `/course/$courseSlug/…` URL — and the lesson is looked up WITHIN it through
 * `courseModuleIds`, so a forged request still cannot write a pointer into a
 * course the lesson is not placed in. Returns false when the lesson is not
 * placed in the course, so the route can 404 instead of silently doing
 * nothing.
 *
 * Explicit rather than inferred because a lesson can be taught by SEVERAL
 * courses via `module_lessons`, and the pointer is per course: this used to
 * derive the course from the lesson (the lowest course id), which parked a
 * learner's resume point in a course they were not reading.
 *
 * Deliberately does NOT re-check the lesson gate. The client only calls this
 * when the lesson rendered unlocked content, and `resolveResumeTarget` hops
 * off a locked pointer on read anyway — so the worst a forged write achieves
 * is redirecting the forger to a lesson they still cannot open. Re-running
 * the gate here would mean a full progress aggregation on every lesson view.
 */
export async function recordLastViewedLesson({
  userId,
  lessonSlug,
  courseId,
}: {
  userId: string;
  lessonSlug: string;
  courseId: number;
}): Promise<boolean> {
  const [lesson] = await db
    .select({ lessonId: lessonsTable.id })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .where(
      and(
        eq(lessonsTable.slug, lessonSlug),
        inArray(moduleLessonsTable.moduleId, courseModuleIds(courseId)),
      ),
    )
    .limit(1);
  if (!lesson) return false;

  await db
    .insert(courseLastViewedTable)
    .values({
      userId,
      courseId,
      lessonId: lesson.lessonId,
    })
    .onConflictDoUpdate({
      target: [courseLastViewedTable.userId, courseLastViewedTable.courseId],
      set: {
        lessonId: lesson.lessonId,
        viewedAt: sql`now()`,
      },
    });
  return true;
}
