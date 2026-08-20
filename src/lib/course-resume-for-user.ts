import { getUserRoleNames } from '#/db/admin';
import { getCourseDetailsWithCache } from '#/db/course';
import { getLastViewedLessonId } from '#/db/course-last-viewed';
import { getCourseProgress } from '#/db/course-progress';
import { isCourseStaff } from '#/db/course-staff';
import { getCurrentLevel } from '#/db/user-levels';
import { hasAdminAccess } from '#/lib/admin-schemas';
import type { ResumeTarget } from '#/lib/course-resume';
import { resolveResumeTargetForLevel } from '#/lib/course-resume-level';
import { watchedLessonSlugs } from '#/lib/lesson-gating-inputs';

/**
 * Where `/course/$courseSlug` should send this learner.
 *
 * Lives here rather than inside `getCourseResumeTarget`'s handler purely so it
 * can be called from a test: Start's compiler rewrites the exported server fn
 * into an RPC shim that resolves its body through a manifest vitest does not
 * have, so a handler body is unreachable in-process. Not a `.server.ts` and
 * not exported to any client module — `course-resume-functions.ts` imports it
 * only from inside the handler body, which the same compiler strips from the
 * client bundle along with this import, exactly as it already does for the
 * drizzle modules above.
 */
export async function resumeTargetForUser({
  userId,
  courseSlug,
}: {
  userId: string;
  courseSlug: string;
}): Promise<ResumeTarget> {
  const [details, roles, pointerLessonId] = await Promise.all([
    getCourseDetailsWithCache(courseSlug),
    getUserRoleNames(userId),
    getLastViewedLessonId({ userId, courseSlug }),
  ]);

  // Not the "course doesn't exist" case — the parent beforeLoad already
  // confirmed a subscription to this slug. A missing payload means Redis is
  // down or a cache-population race lost, and rendering "this course has no
  // lessons yet" would state something false about the course. Throwing
  // surfaces it as a real, retryable error, matching evaluateLessonGate's
  // handling of the same condition.
  if (!details) {
    throw new Error(`Course payload unavailable for ${courseSlug}`);
  }

  // Org `owner`/`admin` bypass everywhere and are asked first, so they never
  // pay the staff query; a `subject-expert`/`course-manager` bypasses only
  // on the course they are staffed on, and is an ordinary gated learner in
  // every other course.
  const viewingAsAuthor =
    hasAdminAccess(roles) || (await isCourseStaff(userId, details.id));

  // Progress is only needed to evaluate locks, and an author has none to
  // evaluate — skip the aggregation entirely for them.
  // Both skipped for an author: they have no progress to evaluate and no
  // tier to be filtered by — the same short-circuit `evaluateLessonGate`
  // makes.
  const [progress, level] = viewingAsAuthor
    ? [{ lessons: [] as { lessonId: number; watched: boolean }[] }, null]
    : await Promise.all([
        getCourseProgress({ userId, slug: courseSlug }),
        getCurrentLevel(userId, details.id),
      ]);

  // `watched` is deliberately computed from the UNFILTERED payload while
  // the course handed to the predicate is filtered — see
  // resolveResumeTargetForLevel for why the two halves must differ.
  return resolveResumeTargetForLevel({
    details,
    watched: watchedLessonSlugs(details, progress),
    pointerLessonId,
    level,
    bypassLocks: viewingAsAuthor,
  });
}
