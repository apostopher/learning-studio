import { createFileRoute } from '@tanstack/react-router';
import { resolveLessonPlayback } from '#/db/admin';
import { getCourseIdsForLesson } from '#/db/placements';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  absentResourceResponse,
  requireCoursePermission,
} from '#/lib/permissions.server';
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

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getVideoPlaybackHandler(
  request: Request,
  rawLessonId: string,
): Promise<Response> {
  const lessonId = parsePositiveInt(rawLessonId);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  // The course is NAMED by the client, never inferred from the lesson. A
  // lesson can be placed in several courses and each course holds its own
  // provider credentials, so "which course" decides both who may watch and
  // which key signs the URL — and only the editor (`/admin/$courseId/…`)
  // knows which one it is showing. Inferring it here used to pick the
  // lowest course id, which was the wrong course for anyone in the other.
  const courseId = parsePositiveInt(
    new URL(request.url).searchParams.get('courseId'),
  );
  if (courseId === null) {
    return Response.json(
      { error: 'A valid courseId is required' },
      { status: 400 },
    );
  }
  // Confirm the placement before guarding: guarding on a course the lesson is
  // not in would misreport "no such lesson" as "forbidden". A course the
  // lesson is not placed in gets the SAME answer as an unknown lesson, and
  // that 404 is answered only to someone on the teaching side — see
  // `absentResourceResponse`, which closes the id-enumeration oracle this
  // ordering would otherwise open. Distinct from the "no video assigned" 404
  // below, which only fires once we know the lesson is real and here.
  const placedIn = await getCourseIdsForLesson(lessonId);
  if (!placedIn.includes(courseId)) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  const denied = await guard(request, courseId);
  if (denied) return denied;

  try {
    const playback = await resolveLessonPlayback(lessonId, courseId);
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
