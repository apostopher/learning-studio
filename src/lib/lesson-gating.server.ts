import { getUserRoleNames } from '#/db/admin';
import { getCourseDetailsWithCache } from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import {
  getCourseSlugForLesson,
  isSubscribedToCourse,
} from '#/db/lesson-access';
import { hasAdminAccess } from '#/lib/admin-schemas';
import {
  evaluateLessonLock,
  evaluateMaterialLock,
  type LessonLock,
  type MaterialLock,
} from '#/lib/lesson-gating';
import { toGateCourse, watchedLessonSlugs } from '#/lib/lesson-gating-inputs';

export * from '#/lib/lesson-gating-inputs';

export type LessonGateResult = {
  courseSlug: string;
  courseId: number;
  isAdmin: boolean;
  subscribed: boolean;
  lessonLock: LessonLock;
  materialLock: MaterialLock;
};

/**
 * Evaluate every gate for one user and one lesson. Returns null when the
 * lesson does not exist — or is `is_available = false`, which on the learner
 * path is the same thing — so callers can 404/403 without a second lookup.
 *
 * Admins bypass both gates AND the subscription check: they author this
 * content and should not sit through their own videos to proofread it. The
 * `isAdmin` flag is returned rather than swallowed so the UI can say the
 * bypass applied — a silent bypass makes the feature untestable.
 */
export async function evaluateLessonGate({
  userId,
  lessonSlug,
}: {
  userId: string;
  lessonSlug: string;
}): Promise<LessonGateResult | null> {
  const lesson = await getCourseSlugForLesson(lessonSlug);
  if (!lesson) return null;

  // A WIP lesson is not servable to anyone on the learner path, admins
  // included. This cannot be left to the predicate: `getCourseDetails` strips
  // unavailable lessons, so `evaluateLessonLock` cannot locate them and
  // answers "open" by contract (see lesson-gating.ts) — which means every
  // gate passes and a subscriber who knows a draft slug gets its full
  // material, and /api/lesson/playback hands out its signed, directly-playable URL.
  // Admins are not exempted because the same stripped payload already makes
  // the lesson page render not-found for them; a servable material endpoint
  // behind a not-found page would just be an inconsistency.
  if (!lesson.isAvailable) return null;

  // Deliberately re-projected rather than spread, so `isAvailable` — consumed
  // entirely by the branch above — cannot ride along into LessonGateResult as
  // a field with no reader.
  const course = { courseSlug: lesson.courseSlug, courseId: lesson.courseId };

  const [roles, details, progress] = await Promise.all([
    getUserRoleNames(userId),
    getCourseDetailsWithCache(course.courseSlug),
    getCourseProgress({ userId, slug: course.courseSlug }),
  ]);

  // A gate that cannot be evaluated must never fail open. This is not the
  // "lesson doesn't exist" case (that already returned above) — the lesson
  // and course are known good, but the cached course payload didn't come
  // back, e.g. a Redis outage or a cache-population race. Serving locks as
  // "open" here would let a student through with unmet prerequisites, and
  // silently, since nothing would look broken. Throwing surfaces it as a 500
  // (see Task 5's route handler) so the failure is visible and retryable —
  // including for admins, since a missing payload means something is
  // genuinely wrong and a bypass would hide that.
  if (!details) {
    throw new Error(`Course payload unavailable for ${course.courseSlug}`);
  }

  const isAdmin = hasAdminAccess(roles);
  if (isAdmin) {
    return {
      ...course,
      isAdmin: true,
      subscribed: true,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    };
  }

  const subscribed = await isSubscribedToCourse(userId, course.courseId);
  const gateCourse = toGateCourse(details);
  const watched = watchedLessonSlugs(details, progress);

  return {
    ...course,
    isAdmin: false,
    subscribed,
    lessonLock: evaluateLessonLock(gateCourse, lessonSlug, watched),
    materialLock: evaluateMaterialLock(gateCourse, lessonSlug, watched),
  };
}
