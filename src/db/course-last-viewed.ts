import { and, eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseLastViewedTable,
  coursesTable,
  lessonsTable,
  moduleLessonsTable,
  modulesTable,
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
 * Record that this user is on this lesson.
 *
 * The lesson's course is derived from the lesson itself rather than taken
 * from the caller, so a forged request cannot write a pointer into a course
 * the lesson does not belong to. Returns false when the slug matches no
 * lesson, so the route can 404 instead of silently doing nothing.
 *
 * Deliberately does NOT re-check the lesson gate. The client only calls this
 * when the lesson rendered unlocked content, and `resolveResumeTarget` hops
 * off a locked pointer on read anyway — so the worst a forged write achieves
 * is redirecting the forger to a lesson they still cannot open. Re-running
 * the gate here would mean a full progress aggregation on every lesson view.
 *
 * A lesson can now be taught by SEVERAL courses via `module_lessons`, and the
 * caller only ever hands this a bare `lessonSlug` — no course context to say
 * which one the pointer belongs to. Without an `ORDER BY`, the join below
 * could non-deterministically pick a different course on different calls for
 * the same lesson, bouncing the learner's resume pointer between courses.
 * `orderBy` + `limit(1)` pin it to the lowest course id so a given lesson
 * always writes the same course's pointer; a lesson genuinely being resumed
 * per-course would need the caller to pass a courseSlug instead.
 */
export async function recordLastViewedLesson({
  userId,
  lessonSlug,
}: {
  userId: string;
  lessonSlug: string;
}): Promise<boolean> {
  const [lesson] = await db
    .select({ lessonId: lessonsTable.id, courseId: coursesTable.id })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.slug, lessonSlug))
    .orderBy(coursesTable.id)
    .limit(1);
  if (!lesson) return false;

  await db
    .insert(courseLastViewedTable)
    .values({
      userId,
      courseId: lesson.courseId,
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
