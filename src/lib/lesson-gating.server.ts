import { getUserRoleNames } from '#/db/admin';
import { getCourseDetailsWithCache } from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import {
  getCourseSlugForLesson,
  isSubscribedToCourse,
} from '#/db/lesson-access';
import { getCurrentLevel } from '#/db/user-levels';
import { hasAdminAccess } from '#/lib/admin-schemas';
import {
  evaluateLessonLock,
  evaluateMaterialLock,
  type LessonLock,
  type MaterialLock,
} from '#/lib/lesson-gating';
import { toGateCourse, watchedLessonSlugs } from '#/lib/lesson-gating-inputs';
import {
  filterCourseToLevel,
  isLessonVisibleAtLevel,
} from '#/lib/level-visibility';
import type { UserLevel } from '#/types';

export * from '#/lib/lesson-gating-inputs';

export type LessonGateResult = {
  courseSlug: string;
  courseId: number;
  isAdmin: boolean;
  subscribed: boolean;
  /** The pilot's tier in this course, for copy that has to name it. */
  level: UserLevel;
  /**
   * Null when the lesson is in the pilot's tier.
   *
   * Otherwise `readOnly` says whether they completed it before moving on:
   * out-of-tier content you've done is read-only, out-of-tier content you
   * haven't is not yours.
   */
  outOfTier: null | { readOnly: boolean };
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
    // Admins author every tier, so no level applies to them. 'advanced' is
    // reported rather than a fourth value because the field exists for copy
    // that has to name a tier, and the bypass is already signalled by
    // `isAdmin` — a caller that cares reads that, not this.
    return {
      ...course,
      isAdmin: true,
      subscribed: true,
      level: 'advanced',
      outOfTier: null,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    };
  }

  // Concurrent, not sequential: one of this function's nine callers is the
  // video-progress beacon, which fires repeatedly through a playing lesson,
  // and these two queries share no data.
  const [subscribed, level] = await Promise.all([
    isSubscribedToCourse(userId, course.courseId),
    getCurrentLevel(userId, course.courseId),
  ]);

  // Fail closed on the REQUESTED lesson, against the unfiltered payload.
  //
  // This check must not be delegated to `filterCourseToLevel`: dropping the
  // lesson from the payload makes `evaluateLessonLock` fail to locate it, and
  // that function answers `{kind:'open'}` for unknown lessons by contract. So
  // filtering alone would answer "open" for exactly the lessons it is meant to
  // withhold.
  const target = details.modules
    .flatMap((mod) => mod.lessons)
    .find((lesson) => lesson.slug === lessonSlug);

  // The lesson resolved in `getCourseSlugForLesson` and is available, so the
  // cached payload disagreeing about its existence means the payload is wrong
  // — the same class of problem as the missing-payload branch above, and
  // thrown for the same reason. Returning here instead would skip the level
  // check entirely and hand the decision to locks that answer `open` for a
  // lesson they cannot locate: the one line the whole fail-closed intent rests
  // on would be the line that fails open.
  if (!target) {
    throw new Error(
      `Lesson ${lessonSlug} missing from course payload for ${course.courseSlug}`,
    );
  }

  if (!isLessonVisibleAtLevel(target.levels, level)) {
    // Out-of-tier work you already finished stays readable; out-of-tier work
    // you never did is not yours. `percent` is the aggregate across every
    // component of the lesson, so 100 is the only honest reading of "done".
    const completed = progress.lessons.some(
      (row) => row.lessonId === target.id && row.percent === 100,
    );
    return {
      ...course,
      isAdmin: false,
      subscribed,
      level,
      outOfTier: { readOnly: completed },
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    };
  }

  // Filter first, then gate — so a lesson the pilot cannot see can never be
  // named as the prerequisite blocking one they can.
  const gateCourse = toGateCourse(filterCourseToLevel(details, level));
  // Deliberately the UNFILTERED payload: a hidden lesson the pilot completed
  // at an earlier tier still counts as watched, so a visible lesson that
  // explicitly depends on it does not lock on work already done.
  const watched = watchedLessonSlugs(details, progress);

  return {
    ...course,
    isAdmin: false,
    subscribed,
    level,
    outOfTier: null,
    lessonLock: evaluateLessonLock(gateCourse, lessonSlug, watched),
    materialLock: evaluateMaterialLock(gateCourse, lessonSlug, watched),
  };
}
