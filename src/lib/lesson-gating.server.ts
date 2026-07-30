import { getUserRoleNames } from '#/db/admin';
import { getCourseDetailsWithCache } from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import {
  getCourseSlugForLesson,
  isSubscribedToCourse,
} from '#/db/lesson-access';
import { ADMIN_ROLE } from '#/lib/admin-schemas';
import {
  evaluateLessonLock,
  evaluateMaterialLock,
  type LessonLock,
  type MaterialLock,
} from '#/lib/lesson-gating';
import {
  type DetailsCourse,
  toGateCourse,
  watchedLessonSlugs,
} from '#/lib/lesson-gating-inputs';

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
 * lesson does not exist, so callers can 404 without a second lookup.
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
  const course = await getCourseSlugForLesson(lessonSlug);
  if (!course) return null;

  const [roles, details, progress] = await Promise.all([
    getUserRoleNames(userId),
    getCourseDetailsWithCache(course.courseSlug),
    getCourseProgress({ userId, slug: course.courseSlug }),
  ]);

  const isAdmin = roles.includes(ADMIN_ROLE);
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
  if (!details) {
    return {
      ...course,
      isAdmin: false,
      subscribed,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    };
  }

  const gateCourse = toGateCourse(details as unknown as DetailsCourse);
  const watched = watchedLessonSlugs(
    details as unknown as DetailsCourse,
    progress,
  );

  return {
    ...course,
    isAdmin: false,
    subscribed,
    lessonLock: evaluateLessonLock(gateCourse, lessonSlug, watched),
    materialLock: evaluateMaterialLock(gateCourse, lessonSlug, watched),
  };
}
