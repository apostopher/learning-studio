import { createFileRoute } from '@tanstack/react-router';
import { getLessonPlayback } from '#/db/lesson-playback';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';
import { PlaybackError } from '#/lib/video-providers/errors';

/**
 * Provider-agnostic playback for the learner player.
 *
 * The session and gate checks are not optional: the response embeds a signed,
 * directly-playable URL. One uniform 403 covers "no such lesson", "not
 * subscribed", "locked" and "no video" alike — distinguishing them hands an
 * enumeration oracle to any signed-in caller.
 */
export async function getLessonPlaybackHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const lessonSlug = url.searchParams.get('lessonSlug');
  if (!lessonSlug)
    return new Response('lessonSlug is required', { status: 400 });
  // Lets a caller that already observed a real playback failure (a
  // mid-playback 401/403, or a plain retry click — see
  // `VideoPlayerContainer`/`compute-recovery-action.ts`) skip the Redis
  // cache read and get a URL the provider has not already refused. Gated
  // behind the SAME session+lesson-gate checks as every other request here —
  // this is never a way to reach `resolvePlayback` (and the provider APIs
  // behind it) without authorization.
  const fresh = url.searchParams.get('fresh') === '1';

  try {
    const gate = await evaluateLessonGate({
      userId: session.user.id,
      lessonSlug,
    });
    if (!gate || !gate.subscribed || gate.lessonLock.kind !== 'open') {
      return new Response('Forbidden', { status: 403 });
    }
    // Outside the pilot's level. A lesson they COMPLETED at an earlier level
    // still plays: the read-only page exists to show them their own earlier
    // work, and a read-only lesson behind a dead player is a broken promise.
    // Nothing on this path writes — the milestone beacon posts to
    // /api/user/report-video-progress, which refuses out-of-tier lessons
    // outright, so watching an archive records nothing against it.
    //
    // Refused with the same opaque 403 as every other reason above, NOT with a
    // named `out-of-tier` body: naming it would tell any signed-in caller that
    // a slug exists and merely sits in another tier, which is the enumeration
    // oracle the uniform 403 exists to deny. The lesson page learns the reason
    // from /api/lesson/material, the endpoint that already distinguishes its
    // refusals.
    if (gate.outOfTier && !gate.outOfTier.readOnly) {
      return new Response('Forbidden', { status: 403 });
    }
    const playback = await getLessonPlayback(lessonSlug, {
      skipCache: fresh,
    });
    if (!playback) return new Response('Forbidden', { status: 403 });
    return Response.json(playback);
  } catch (error) {
    console.error('Failed to resolve lesson playback:', error);
    // Carry the code, as the admin route already does. Without it every
    // failure reaches the learner as one opaque message with a Retry button,
    // including the ones retrying can never fix.
    if (error instanceof PlaybackError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 502 },
      );
    }
    return new Response('Playback lookup failed', { status: 502 });
  }
}

export const Route = createFileRoute('/api/lesson/playback')({
  server: {
    handlers: { GET: ({ request }) => getLessonPlaybackHandler(request) },
  },
});
