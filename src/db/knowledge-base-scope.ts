import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { isCourseStaff } from '#/db/course-staff';
import { isSubscribedToCourse } from '#/db/lesson-access';
import { coursesTable } from '#/db/schema';
import { getUserRoleNames } from '#/db/user-roles';
import { hasAdminAccess } from '#/lib/admin-schemas';

/**
 * The course whose `docs` a knowledge-base search may read, or null for
 * org-wide docs only.
 *
 * `courseSlug` arrives from the chat client and is not proof of anything, so
 * it only unlocks a course's documents for someone allowed in that course: a
 * subscriber, course staff, or an org owner/admin — the same people
 * `getCourseContentForAgent` serves that course's lesson content to. Anyone
 * else, an unknown slug, or no course in context all fall back to org-wide
 * docs, never to every course's.
 */
export async function resolveKBCourseId({
  userId,
  courseSlug,
}: {
  userId: string;
  courseSlug?: string;
}): Promise<number | null> {
  if (!courseSlug) return null;

  const [course] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.slug, courseSlug))
    .limit(1);
  if (!course) return null;

  const [roles, subscribed] = await Promise.all([
    getUserRoleNames(userId),
    isSubscribedToCourse(userId, course.id),
  ]);
  // Admins first so they never pay the staff query, as in course-content.ts.
  const allowed =
    subscribed ||
    hasAdminAccess(roles) ||
    (await isCourseStaff(userId, course.id));
  return allowed ? course.id : null;
}
