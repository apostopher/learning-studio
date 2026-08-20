import { getUserRoleNames } from '#/db/admin';
import { getCourseIdentityBySlug } from '#/db/course';
import { isCourseStaff } from '#/db/course-staff';
import { isSubscribedToCourse } from '#/db/lesson-access';
import { RETENTION_DAYS } from '#/db/news-articles';
import {
  getMutedSourceIds,
  getSourceCourseId,
  listCourseSourceChoices,
  listVisibleFeedRows,
  setSourceMuted,
} from '#/db/news-feed';
import { hasAdminAccess } from '#/lib/admin-schemas';
import { latestFirstSeenAt, shapeNewsFeed } from '#/lib/news-feed-shaping';
import type { NewsFeedResponse } from '#/lib/news-schemas';

/**
 * The news feed one learner may see in one course.
 *
 * Returns null when the course does not exist, so callers can 404 without a
 * second lookup — the same contract as `getLibraryForUser`. A non-admin who is
 * not subscribed gets EMPTY arrays rather than null: the route guard has
 * already redirected them from the page, so this is not a reachable
 * enumeration surface, and "you are in this course and there is nothing yet"
 * and "you are not in this course" are both honestly answered by an empty
 * feed. Same posture, same reasoning, as the library.
 *
 * Admins read any course without a subscription (D16), matching the library —
 * they configure these sources and should be able to see what the feed
 * produced without enrolling. Course staff do the same on the one course they
 * are staffed on, and nowhere else.
 */
export async function getNewsForUser({
  userId,
  courseSlug,
  now = new Date(),
}: {
  userId: string;
  courseSlug: string;
  now?: Date;
}): Promise<NewsFeedResponse | null> {
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
  if (!viewingAsAuthor && !subscribed) {
    return {
      articles: [],
      sources: [],
      lastUpdatedAt: null,
      adminBypass: false,
    };
  }

  const mutedSourceIds = await getMutedSourceIds({
    userId,
    courseId: course.id,
  });
  const since = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);

  const [rows, sources] = await Promise.all([
    listVisibleFeedRows({ courseId: course.id, since, mutedSourceIds }),
    listCourseSourceChoices({ courseId: course.id, mutedIds: mutedSourceIds }),
  ]);

  return {
    articles: shapeNewsFeed(rows),
    sources,
    lastUpdatedAt: latestFirstSeenAt(rows),
    // Named for the admin case it was built for; now also true for a
    // subject expert reading their own course without enrolling in it.
    adminBypass: viewingAsAuthor && !subscribed,
  };
}

export type SetMutedResult =
  | { ok: true; sourceId: number; muted: boolean }
  | { ok: false; reason: 'not_found' };

/**
 * Mute or unmute one source for this learner.
 *
 * "No such source" and "a source in a course you are not in" both return
 * `not_found`, so the endpoint cannot be used to probe which source ids exist
 * in other courses — the same reasoning as the course-slug redirect in
 * `_authed/course.$courseSlug.tsx`, which refuses to distinguish a bogus slug
 * from an unenrolled one.
 */
export async function setNewsSourceMuted({
  userId,
  sourceId,
  muted,
}: {
  userId: string;
  sourceId: number;
  muted: boolean;
}): Promise<SetMutedResult> {
  const courseId = await getSourceCourseId(sourceId);
  if (courseId === null) return { ok: false, reason: 'not_found' };

  const [roles, subscribed] = await Promise.all([
    getUserRoleNames(userId),
    isSubscribedToCourse(userId, courseId),
  ]);
  // Subscription first, then org-wide authority, and only then the staff row:
  // the common caller is an enrolled learner, and neither they nor an admin
  // should pay for a query that answers a question already settled.
  if (
    !subscribed &&
    !hasAdminAccess(roles) &&
    !(await isCourseStaff(userId, courseId))
  ) {
    return { ok: false, reason: 'not_found' };
  }

  await setSourceMuted({ userId, sourceId, muted });
  return { ok: true, sourceId, muted };
}
