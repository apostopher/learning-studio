import { createFileRoute } from '@tanstack/react-router';
import { getLessonPlayback } from '#/db/lesson-playback';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

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

  const lessonSlug = new URL(request.url).searchParams.get('lessonSlug');
  if (!lessonSlug)
    return new Response('lessonSlug is required', { status: 400 });

  try {
    const gate = await evaluateLessonGate({
      userId: session.user.id,
      lessonSlug,
    });
    if (!gate || !gate.subscribed || gate.lessonLock.kind !== 'open') {
      return new Response('Forbidden', { status: 403 });
    }
    const playback = await getLessonPlayback(lessonSlug);
    if (!playback) return new Response('Forbidden', { status: 403 });
    return Response.json(playback);
  } catch (error) {
    console.error('Failed to resolve lesson playback:', error);
    return new Response('Playback lookup failed', { status: 502 });
  }
}

export const Route = createFileRoute('/api/lesson/playback')({
  server: {
    handlers: { GET: ({ request }) => getLessonPlaybackHandler(request) },
  },
});
