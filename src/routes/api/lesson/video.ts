import { createFileRoute } from '@tanstack/react-router';
import { getVideoDetailsWithCache } from '#/integrations/synthesia/videos';
import { auth } from '#/lib/auth';

/**
 * Synthesia video details for the learner player.
 *
 * Any authenticated user may read these — no admin role needed. The session
 * check is not optional: the response embeds Synthesia's **pre-signed `download`
 * URL**, so before this gate existed anyone on the internet who reached this
 * route could stream video straight out of the account, and it does so with the
 * global `SYNTHESIA_API_KEY` rather than a per-course credential.
 *
 * KNOWN GAP — authenticated, not authorized: any signed-in user can still
 * request any `videoId` in the Synthesia account, not just videos belonging to
 * lessons on courses they're subscribed to. Closing that needs a
 * videoRef → lesson → module → course → subscription lookup, which does not
 * exist yet. Failures below stay deliberately uniform so this route at least
 * does not confirm which IDs are real.
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
    const details = await getVideoDetailsWithCache(videoId);
    return Response.json(details);
  } catch {
    // Intentionally one status for every failure. Distinguishing "no such
    // video" from "provider error" would hand an enumeration oracle to any
    // signed-in caller, which matters while the gap above is open.
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
