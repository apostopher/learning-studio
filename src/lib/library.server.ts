import { getUserRoleNames } from '#/db/admin';
import {
  getCourseDetailsWithCache,
  getCourseIdentityBySlug,
} from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import { isCourseStaff } from '#/db/course-staff';
import { isSubscribedToCourse } from '#/db/lesson-access';
import { getLibraryForCourse } from '#/db/library';
import { getCurrentLevel } from '#/db/user-levels';
import { hasAdminAccess } from '#/lib/admin-schemas';
import { toGateCourse, watchedLessonSlugs } from '#/lib/lesson-gating-inputs';
import { filterCourseToLevel } from '#/lib/level-visibility';
import { type LibraryFile, resolveLibraryFiles } from '#/lib/library-gating';

export type LibraryResult = {
  /**
   * "Read as author", despite the name: true for org `owner`/`admin`, and for
   * a `subject-expert`/`course-manager` staffed on THIS course. Kept as
   * `adminBypass` because its consumers render the admin preview notice, which
   * says exactly what an SME previewing their own course needs told.
   */
  adminBypass: boolean;
  files: LibraryFile[];
};

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
 * through their own videos to check a PDF is attached correctly. Course staff
 * bypass on the same terms, but only on the course they are staffed on: an
 * SME opening someone else's course is an ordinary gated learner there.
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
  // Org `owner`/`admin` first so they never pay the staff query; a
  // `subject-expert`/`course-manager` bypasses only on their own course.
  const viewingAsAuthor =
    hasAdminAccess(roles) || (await isCourseStaff(userId, course.id));
  if (!viewingAsAuthor && !subscribed) return { adminBypass: false, files: [] };

  // An author has no tier — they wrote every one — so they skip the level
  // lookup entirely, exactly as they skip every gate in `evaluateLessonGate`.
  const [library, details, progress, level] = await Promise.all([
    getLibraryForCourse(course.id),
    getCourseDetailsWithCache(courseSlug),
    getCourseProgress({ userId, slug: courseSlug }),
    viewingAsAuthor ? null : getCurrentLevel(userId, course.id),
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

  // Filter first, then gate — the sixth enforcement surface, and the one
  // place where filtering ALONE is sufficient.
  //
  // `evaluateLessonGate` and `getCourseContentForAgent` both need a second,
  // explicit check because `evaluateLessonLock` answers `{kind:'open'}` for a
  // lesson it cannot locate. `resolveAssignment` is the opposite by contract:
  // a lesson (or module) absent from the index returns `null`, which drops the
  // file from the result entirely rather than unlocking it. So removing an
  // out-of-tier lesson here HIDES its files instead of releasing them.
  //
  // Withheld in BOTH out-of-tier states, read-only included: a file is a
  // durable copy that leaves the site, not a rendering of work already done.
  const gateCourse = toGateCourse(
    level === null ? details : filterCourseToLevel(details, level),
  );

  // The author bypass is expressed as "every lesson is watched", not as a
  // branch that skips `resolveLibraryFiles`. That keeps authors on exactly the
  // same code path as students — so a file hidden by D9 (WIP lesson) stays
  // hidden for them too, which is what makes the author view a truthful
  // preview of what a finished student sees rather than a different feature.
  //
  // Deliberately the UNFILTERED payload for a student: a lesson finished at an
  // earlier tier still satisfies a visible lesson's file. Slugs no longer in
  // `gateCourse` are simply never looked up.
  const watched = viewingAsAuthor
    ? new Set(gateCourse.modules.flatMap((m) => m.lessons.map((l) => l.slug)))
    : watchedLessonSlugs(details, progress);

  return {
    adminBypass: viewingAsAuthor,
    files: resolveLibraryFiles({
      files: library.files,
      assignments: library.assignments,
      course: gateCourse,
      watchedLessonSlugs: watched,
    }),
  };
}
