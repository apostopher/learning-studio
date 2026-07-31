import { createFileRoute } from '@tanstack/react-router';
import { getUserRoleNames } from '#/db/admin';
import type { CourseDetails } from '#/db/course';
import { getCourseDetailsWithCache } from '#/db/course';
import { isSubscribedToCourseSlug } from '#/db/lesson-access';
import { ADMIN_ROLE } from '#/lib/admin-schemas';
import { auth } from '#/lib/auth';

/**
 * Drop `videoId` from each lesson before the payload leaves the server.
 *
 * `hasVideo` already rides along on the cached `CourseDetails` object (see
 * `db/course.ts`'s `LessonDetails`), computed once from `videoProvider`/
 * `videoRef` — this only needs to omit the raw identifier, not recompute
 * anything. Nothing outside the playback layer should be able to read a
 * video's identity off this route, only whether one exists.
 */
function omitVideoId<T extends { videoId: unknown }>(
  lesson: T,
): Omit<T, 'videoId'> {
  const { videoId: _videoId, ...rest } = lesson;
  return rest;
}

function toLearnerCourseDetails(course: NonNullable<CourseDetails>) {
  return {
    ...course,
    modules: course.modules.map((mod) => ({
      ...mod,
      lessons: mod.lessons.map(omitVideoId),
    })),
  };
}

/** The shape `/api/course/details` actually serves — `videoId`-free. */
export type LearnerCourseDetails = ReturnType<typeof toLearnerCourseDetails>;

/**
 * The module/lesson tree the learner UI renders: the sidebar, the lesson page's
 * lesson lookup, and the client-side lock explanations.
 *
 * Authorization is not optional here. The payload carries the whole
 * dependency graph (which lesson blocks which), so before this check existed
 * it was a free enumeration source for exactly the slugs `/api/lesson/playback`
 * (née `/api/lesson/video`) was hardened against — anyone on the internet
 * could list them. It now requires a session (401) and a subscription to the
 * course (403), with admins bypassing, matching `/api/lesson/material` and
 * `/api/lesson/playback`. Each lesson's `videoId` is additionally stripped
 * (`toLearnerCourseDetails`, below) before the response is built — the
 * sidebar and lesson page only ever needed to know WHETHER a lesson has a
 * video, never which one.
 *
 * It reads `getCourseDetailsWithCache`, NOT the uncached `getCourseDetails`, so
 * the client explains the gate from the same payload the server enforces it
 * from. With two different readers the browser held an uncached snapshot for
 * 48h while the server read Redis, and after an admin published a lesson or
 * edited a dependency the two disagreed in either direction: a row shown open
 * that 403s, or a row shown locked that opens.
 *
 * KNOWN FOLLOW-UP: the Redis entry has a 6h TTL and no invalidation on admin
 * mutation, so an admin edit can take up to 6h to appear on the learner path.
 * Deliberately out of scope for this change.
 */
export async function getCourseDetailsHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  if (!slug) {
    return new Response('Slug is required', { status: 400 });
  }

  const [roles, subscribed] = await Promise.all([
    getUserRoleNames(session.user.id),
    isSubscribedToCourseSlug(session.user.id, slug),
  ]);
  if (!roles.includes(ADMIN_ROLE) && !subscribed) {
    return new Response('Forbidden', { status: 403 });
  }

  const course = await getCourseDetailsWithCache(slug);
  return Response.json(course ? toLearnerCourseDetails(course) : course);
}

export const Route = createFileRoute('/api/course/details')({
  server: {
    handlers: {
      GET: ({ request }) => getCourseDetailsHandler(request),
    },
  },
});
