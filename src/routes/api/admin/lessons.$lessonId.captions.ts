import { createFileRoute } from '@tanstack/react-router';
import { getCourseIdsForLesson } from '#/db/placements';
import {
  getCaptionsTarget,
  getLessonCaptionsStatus,
  requestLessonCaptions,
} from '#/db/video-captions';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  absentResourceResponse,
  requireCoursePermission,
} from '#/lib/permissions.server';
import {
  isVideoLang,
  PRIMARY_VIDEO_LANG,
  type VideoLang,
} from '#/lib/video-languages';

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const langFrom = (raw: string | null): VideoLang =>
  isVideoLang(raw) ? raw : PRIMARY_VIDEO_LANG;

/**
 * Shared front half of GET and POST: ids, language, placement, guard. The
 * course is named by the client (the editor knows which course it shows) —
 * same reasoning and same 404-before-403 ordering as `video-playback`.
 */
async function authorize(
  request: Request,
  rawLessonId: string,
  action: 'read' | 'update',
): Promise<
  | { ok: true; lessonId: number; lang: VideoLang }
  | { ok: false; response: Response }
> {
  const lessonId = parsePositiveInt(rawLessonId);
  if (lessonId === null) {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid lesson id' }, { status: 400 }),
    };
  }
  const { searchParams } = new URL(request.url);
  const courseId = parsePositiveInt(searchParams.get('courseId'));
  if (courseId === null) {
    return {
      ok: false,
      response: Response.json(
        { error: 'A valid courseId is required' },
        { status: 400 },
      ),
    };
  }
  const placedIn = await getCourseIdsForLesson(lessonId);
  if (!placedIn.includes(courseId)) {
    return {
      ok: false,
      response: await absentResourceResponse(
        request.headers,
        'Lesson not found',
      ),
    };
  }
  try {
    await requireCoursePermission(request.headers, courseId, 'content', action);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return {
        ok: false,
        response: new Response('Forbidden', { status: 403 }),
      };
    }
    throw error;
  }
  return { ok: true, lessonId, lang: langFrom(searchParams.get('lang')) };
}

export async function getCaptionsHandler(
  request: Request,
  rawLessonId: string,
): Promise<Response> {
  const auth = await authorize(request, rawLessonId, 'read');
  if (!auth.ok) return auth.response;
  const status = await getLessonCaptionsStatus(auth.lessonId, auth.lang);
  if (!status) return new Response('Not found', { status: 404 });
  return Response.json(status);
}

export async function postCaptionsHandler(
  request: Request,
  rawLessonId: string,
): Promise<Response> {
  const auth = await authorize(request, rawLessonId, 'update');
  if (!auth.ok) return auth.response;
  const target = await getCaptionsTarget(auth.lessonId, auth.lang);
  if (!target) return new Response('Not found', { status: 404 });
  if (target.provider !== 'mux') {
    return Response.json(
      { error: 'Captions come from the provider for this video.' },
      { status: 409 },
    );
  }
  const status = await requestLessonCaptions({
    lessonId: auth.lessonId,
    playbackId: target.ref,
    lang: target.lang,
  });
  return Response.json({ status });
}

export const Route = createFileRoute('/api/admin/lessons/$lessonId/captions')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getCaptionsHandler(request, params.lessonId),
      POST: ({ request, params }) =>
        postCaptionsHandler(request, params.lessonId),
    },
  },
});
