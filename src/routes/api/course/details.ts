import { createFileRoute } from '@tanstack/react-router';
import { getUserRoleNames } from '#/db/admin';
import {
  getCourseDetailsWithCache,
  getCourseIdentityBySlug,
} from '#/db/course';
import { isCourseStaff } from '#/db/course-staff';
import { isSubscribedToCourseSlug } from '#/db/lesson-access';
import { hasAdminAccess } from '#/lib/admin-schemas';
import { auth } from '#/lib/auth';
import type { LearnerCourseDetails } from '#/lib/course-details-shape';
import { toLearnerCourseDetails } from '#/lib/course-details-shape';

/**
 * The module/lesson tree the learner UI renders: the sidebar, the lesson page's
 * lesson lookup, and the client-side lock explanations.
 *
 * Authorization is not optional here. The payload carries the whole
 * dependency graph (which lesson blocks which), so before this check existed
 * it was a free enumeration source for exactly the slugs `/api/lesson/playback`
 * (née `/api/lesson/video`) was hardened against — anyone on the internet
 * could list them. It now requires a session (401) and a subscription to the
 * course (403), with admins — and the staff of that one course — bypassing,
 * matching `/api/lesson/material` and `/api/lesson/playback`. Every
 * video-identifying field on each lesson —
 * `videoProvider`, `videoRef`, `otherVideoIds` —
 * is additionally stripped (`toLearnerCourseDetails`, `#/lib/course-details-shape`)
 * before the response is built. `videoProvider`/`videoRef` matter most: this
 * route has no zod parse on the way out, only a cast, so
 * whatever ships lands in the client object and the network tab both, and a
 * bare Mux `videoRef` is directly streamable
 * (`https://stream.mux.com/{ref}.m3u8`) unless every asset is
 * signed-policy-only — an operator setting in the Mux console this code
 * cannot verify, not a guarantee. The sidebar and lesson page only ever
 * needed to know WHETHER a lesson has a video, never which one or how to
 * reach it directly.
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
  // Three questions, cheapest first, and each one settles it: an org
  // `owner`/`admin` bypasses everywhere, an enrolled learner is already in.
  // Only someone who is neither pays the two lookups below — and this route
  // carries a slug, not a course id, so resolving one is what a staff check
  // costs here. A `subject-expert`/`course-manager` reads the tree of the
  // course they are staffed on; on any other course they are refused exactly
  // as any other stranger is.
  if (!hasAdminAccess(roles) && !subscribed) {
    const identity = await getCourseIdentityBySlug(slug);
    const staff = identity
      ? await isCourseStaff(session.user.id, identity.id)
      : false;
    if (!staff) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const course = await getCourseDetailsWithCache(slug);
  // Typed against the shared `LearnerCourseDetails` (nullable, mirroring
  // `getCourseDetailsWithCache`'s own nullability for an unknown/uncached
  // slug) rather than left inferred, so this assignment is a real
  // compile-time cross-check: if `toLearnerCourseDetails`'s output ever stops
  // satisfying what `LearnerCourseDetails` promises consumers, `tsc` catches
  // it here, at the one place both types meet.
  const payload: LearnerCourseDetails = course
    ? toLearnerCourseDetails(course)
    : null;
  return Response.json(payload);
}

export const Route = createFileRoute('/api/course/details')({
  server: {
    handlers: {
      GET: ({ request }) => getCourseDetailsHandler(request),
    },
  },
});
