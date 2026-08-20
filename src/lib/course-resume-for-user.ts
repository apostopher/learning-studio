import { getUserRoleNames } from '#/db/admin';
import { getCourseDetailsWithCache } from '#/db/course';
import { getLastViewedLessonId } from '#/db/course-last-viewed';
import { getCourseProgress } from '#/db/course-progress';
import { isCourseStaff } from '#/db/course-staff';
import { getCurrentLevel } from '#/db/user-levels';
import { hasAdminAccess } from '#/lib/admin-schemas';
import { auth } from '#/lib/auth';
import type { ResumeTarget } from '#/lib/course-resume';
import { resolveResumeTargetForLevel } from '#/lib/course-resume-level';
import { watchedLessonSlugs } from '#/lib/lesson-gating-inputs';

/**
 * The session half of `getCourseResumeTarget`, kept OUT of the server fn's
 * handler so the wiring below can be asserted.
 *
 * Start's compiler rewrites an exported server fn into an RPC shim that
 * resolves its body through a manifest built only for the server bundle
 * (`@tanstack/start-server-core`'s `#tanstack-start-server-fn-resolver` import
 * maps to `fake-start-server-fn-resolver` under every other condition, and
 * that fake returns `undefined`), so anything left inside a handler is
 * unreachable from a test. Leaving `session.user.id` in there would mean
 * nothing could prove the resume target is resolved for the SIGNED-IN user
 * rather than, say, the slug — a type-legal mistake. What remains in the
 * handler is one `getRequestHeaders()` call.
 *
 * Derives the user from the session, never from an argument, for the same
 * reason `getMySubscribedSlugs` does.
 */
export async function resumeTargetForRequest({
  headers,
  courseSlug,
}: {
  headers: HeadersInit;
  courseSlug: string;
}): Promise<ResumeTarget> {
  const session = await auth.api.getSession({ headers });
  // The parent route's beforeLoad already rejects anonymous callers; an
  // unauthenticated hit here means the guard changed, so report "nothing to
  // resume" rather than inventing a target for a user we cannot identify.
  if (!session) return { kind: 'none', reason: 'no-lessons' };

  return resumeTargetForUser({ userId: session.user.id, courseSlug });
}

/**
 * Where `/course/$courseSlug` should send this learner.
 *
 * Lives here rather than inside `getCourseResumeTarget`'s handler purely so it
 * can be called from a test — see `resumeTargetForRequest` above. Not a
 * `.server.ts` and not exported to any client module:
 * `course-resume-functions.ts` imports this file only from inside the handler
 * body, which the compiler strips from the client bundle along with this
 * import, exactly as it already does for the drizzle and auth modules above.
 * (Verified after a full build by grepping every client asset.)
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
