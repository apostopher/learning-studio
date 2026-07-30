import { createFileRoute } from '@tanstack/react-router';
import { getLessonByVideoId } from '#/db/lesson-access';
import { getVideoDetailsWithCache } from '#/integrations/synthesia/videos';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

/**
 * Synthesia video details for the learner player.
 *
 * The session check is not optional: the response embeds Synthesia's
 * pre-signed `download` URL, so before this gate existed anyone on the
 * internet who reached this route could stream video straight out of the
 * account.
 *
 * Authorization now resolves videoId → lesson → course and applies the same
 * module and lesson gates as the material route, closing the enumeration gap
 * this route used to document. A videoId that resolves to no lesson is DENIED,
 * not allowed through — `getLessonByVideoId` matches `lessons.video_id` only,
 * so a lesson's `other_video_ids` are not currently playable by this route.
 * Failures below stay deliberately uniform so the route never confirms which
 * IDs are real.
 */
export async function getLessonVideoHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  if (!videoId) {
    return new Response('videoId is required', { status: 400 });
  }

  try {
    const lesson = await getLessonByVideoId(videoId);
    // One status for "no such lesson", "not subscribed", and "locked" alike:
    // distinguishing them hands an enumeration oracle to any signed-in caller.
    if (!lesson) return new Response('Forbidden', { status: 403 });

    const gate = await evaluateLessonGate({
      userId: session.user.id,
      lessonSlug: lesson.lessonSlug,
    });
    if (!gate || !gate.subscribed || gate.lessonLock.kind !== 'open') {
      return new Response('Forbidden', { status: 403 });
    }
  } catch (error) {
    console.error('Failed to authorize lesson video:', error);
    return new Response('Video lookup failed', { status: 502 });
  }

  try {
    const details = await getVideoDetailsWithCache(videoId);
    return Response.json(details);
  } catch {
    return new Response('Video lookup failed', { status: 502 });
  }
}

export const Route = createFileRoute('/api/lesson/video')({
  server: {
    handlers: {
      GET: ({ request }) => getLessonVideoHandler(request),
    },
  },
});
