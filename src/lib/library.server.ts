import { getUserRoleNames } from '#/db/admin';
import {
  getCourseDetailsWithCache,
  getCourseIdentityBySlug,
} from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import { isSubscribedToCourse } from '#/db/lesson-access';
import { getLibraryForCourse } from '#/db/library';
import { ADMIN_ROLE } from '#/lib/admin-schemas';
import { toGateCourse, watchedLessonSlugs } from '#/lib/lesson-gating-inputs';
import { type LibraryFile, resolveLibraryFiles } from '#/lib/library-gating';

export type LibraryResult = { adminBypass: boolean; files: LibraryFile[] };

/**
 * Every library file one learner may see in one course, with its lock.
 *
 * Returns null when the course does not exist, so callers can 403 without a
 * second lookup. A non-admin who is not subscribed gets an EMPTY list rather
 * than null: `resolveLibraryFiles` alone proves a file's lesson is unlocked,
 * never that the caller belongs in the course — and `getCourseProgress`
 * happily returns an all-unwatched result for a stranger, so a video-less
 * lesson's file would sail through for a subscriber of another course. Same
 * rule, same reasoning, as filter 2 in `getCourseContentForAgent`.
 *
 * Admins bypass both the subscription check and the gate (D21), matching
 * `evaluateLessonGate` — they author this content and should not have to sit
 * through their own videos to check a PDF is attached correctly.
 */
export async function getLibraryForUser({
  userId,
  courseSlug,
}: {
  userId: string;
  courseSlug: string;
}): Promise<LibraryResult | null> {
  const course = await getCourseIdentityBySlug(courseSlug);
  if (!course) return null;

  const [roles, subscribed] = await Promise.all([
    getUserRoleNames(userId),
    isSubscribedToCourse(userId, course.id),
  ]);
  const isAdmin = roles.includes(ADMIN_ROLE);
  if (!isAdmin && !subscribed) return { adminBypass: false, files: [] };

  const [library, details, progress] = await Promise.all([
    getLibraryForCourse(course.id),
    getCourseDetailsWithCache(courseSlug),
    getCourseProgress({ userId, slug: courseSlug }),
  ]);

  // A gate that cannot be evaluated must never fail open — the same rule
  // `evaluateLessonGate` and `getCourseContentForAgent` both follow. Without
  // the course payload there is no way to tell a published lesson from a WIP
  // one, so serving the library unfiltered would hand out unreleased material.
  // Admins are not exempted: a missing payload means something is genuinely
  // wrong, and a bypass would hide it.
  if (!details) {
    throw new Error(`Course payload unavailable for ${courseSlug}`);
  }

  const gateCourse = toGateCourse(details);

  // The admin bypass is expressed as "every lesson is watched", not as a
  // branch that skips `resolveLibraryFiles`. That keeps admins on exactly the
  // same code path as students — so a file hidden by D9 (WIP lesson) stays
  // hidden for admins too, which is what makes the admin view a truthful
  // preview of what a finished student sees rather than a different feature.
  const watched = isAdmin
    ? new Set(gateCourse.modules.flatMap((m) => m.lessons.map((l) => l.slug)))
    : watchedLessonSlugs(details, progress);

  return {
    adminBypass: isAdmin,
    files: resolveLibraryFiles({
      files: library.files,
      assignments: library.assignments,
      course: gateCourse,
      watchedLessonSlugs: watched,
    }),
  };
}
