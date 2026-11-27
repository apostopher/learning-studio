import {
  isOnCourseRoster,
  isOnCourseRosterBySlug,
} from '#/db/course-roster-access';
import { isCourseStaff, isCourseStaffBySlug } from '#/db/course-staff';
import { hasAdminAccess } from '#/lib/admin-schemas';

/**
 * Whether this user reads this course as its author — every lesson, no level
 * filter, no locks — rather than as a learner.
 *
 * - Staff on the course (`subject-expert`/`course-manager`): always the author.
 * - An org `owner`/`admin`: the author, UNLESS they are on one of the course's
 *   offerings, where they take it as a student like anyone else on the roster
 *   (user, 2026-11-27: "so you can test as a student" — their level, "–"
 *   included, and the locks then apply to them).
 * - Anyone else: a learner.
 *
 * The one definition every author bypass reads (course details, lesson gate,
 * course content, resume, library, news, /app cards), so the sidebar, the
 * lesson page and the server gate cannot disagree about who is an author.
 *
 * `rostered` may be passed when the caller already asked
 * `isSubscribedToCourse`, which is the same question.
 */
export async function viewsCourseAsAuthor(input: {
  userId: string;
  roles: string[];
  courseId: number;
  rostered?: boolean;
}): Promise<boolean> {
  const { userId, roles, courseId } = input;
  if (hasAdminAccess(roles)) {
    const rostered =
      input.rostered ?? (await isOnCourseRoster(userId, courseId));
    if (!rostered) return true;
  }
  return isCourseStaff(userId, courseId);
}

/** `viewsCourseAsAuthor`, for a caller that has only the course's slug. */
export async function viewsCourseAsAuthorBySlug(input: {
  userId: string;
  roles: string[];
  courseSlug: string;
  rostered?: boolean;
}): Promise<boolean> {
  const { userId, roles, courseSlug } = input;
  if (hasAdminAccess(roles)) {
    const rostered =
      input.rostered ?? (await isOnCourseRosterBySlug(userId, courseSlug));
    if (!rostered) return true;
  }
  return isCourseStaffBySlug(userId, courseSlug);
}
