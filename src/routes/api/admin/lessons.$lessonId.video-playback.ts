import { createFileRoute } from '@tanstack/react-router';
import { resolveLessonPlayback } from '#/db/admin';
import { getCourseIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { requireCoursePermission } from '#/lib/permissions.server';
import { PlaybackError } from '#/lib/video-providers/errors';

/** Video playback is content, read-only here. */
async function guard(
  request: Request,
  courseId: number,
): Promise<Response | null> {
  try {
    await requireCoursePermission(request.headers, courseId, 'content', 'read');
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
  const lessonId = parseLessonId(rawLessonId);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  // Resolve the course before guarding: a lesson that doesn't exist must
  // 404, not 403 — guarding on a null course id would misreport "no such
  // lesson" as "forbidden". Distinct from the "no video assigned" 404 below,
  // which only fires once we know the lesson is real.
  const courseId = await getCourseIdForLessonId(lessonId);
  if (courseId === null) {
    return Response.json({ error: 'Lesson not found' }, { status: 404 });
  }
  const denied = await guard(request, courseId);
  if (denied) return denied;

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
