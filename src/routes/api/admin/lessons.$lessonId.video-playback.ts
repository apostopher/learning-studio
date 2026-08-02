import { createFileRoute } from '@tanstack/react-router';
import { resolveLessonPlayback } from '#/db/admin';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { PlaybackError } from '#/lib/video-providers/errors';

/** Admin guard — returns a 403 Response to short-circuit, or null to proceed. */
async function guard(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

function parseLessonId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getVideoPlaybackHandler(
  request: Request,
  rawLessonId: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const lessonId = parseLessonId(rawLessonId);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }

  try {
    const playback = await resolveLessonPlayback(lessonId);
    // 404 now means "no video assigned" only. A missing course credential
    // used to land here too, which made an admin misconfiguration
    // indistinguishable from an empty lesson; it throws
    // PROVIDER_NOT_CONFIGURED instead and is reported as a 502 below.
    if (!playback) return new Response('Not found', { status: 404 });
    return Response.json(playback);
  } catch (error) {
    if (error instanceof PlaybackError) {
      // 502: the request was fine, the upstream provider refused it. `code` is
      // the actual contract — it's what tells the admin UI whether to prompt
      // for a new key or just report a broken video.
      return Response.json(
        { error: error.message, code: error.code },
        { status: 502 },
      );
    }
    // Genuinely unexpected (e.g. a decrypt failure after key rotation) — let it
    // surface as a 500 so Sentry sees it.
    throw error;
  }
}

export const Route = createFileRoute(
  '/api/admin/lessons/$lessonId/video-playback',
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getVideoPlaybackHandler(request, params.lessonId),
    },
  },
});
