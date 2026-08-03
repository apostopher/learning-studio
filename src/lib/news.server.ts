import { getUserRoleNames } from '#/db/admin';
import { getCourseIdentityBySlug } from '#/db/course';
import { isSubscribedToCourse } from '#/db/lesson-access';
import { RETENTION_DAYS } from '#/db/news-articles';
import {
  getMutedSourceIds,
  getSourceCourseId,
  listCourseSourceChoices,
  listVisibleFeedRows,
  setSourceMuted,
} from '#/db/news-feed';
import { ADMIN_ROLE } from '#/lib/admin-schemas';
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
 * produced without enrolling.
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
  const isAdmin = roles.includes(ADMIN_ROLE);
  if (!isAdmin && !subscribed) {
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
    adminBypass: isAdmin && !subscribed,
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
  if (!subscribed && !roles.includes(ADMIN_ROLE)) {
    return { ok: false, reason: 'not_found' };
  }

  await setSourceMuted({ userId, sourceId, muted });
  return { ok: true, sourceId, muted };
}
