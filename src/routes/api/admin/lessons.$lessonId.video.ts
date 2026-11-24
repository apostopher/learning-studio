import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { getLessonVideo, setLessonVideo } from '#/db/admin';
import { getDisciplineIdForLessonId } from '#/db/lesson-access';
import { requestLessonCaptionsSafely } from '#/db/video-captions';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setLessonVideoInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';
import { orVersionConflict } from '#/lib/version-conflict.server';
import { PRIMARY_VIDEO_LANG } from '#/lib/video-languages';

/**
 * Video is lesson content: the working copy every course takes its version
 * from, not any one course's. Authority follows the lesson's DISCIPLINE — the SME
 * who owns it — falling back to org-level admin only when the lesson has
 * none ("Untitled"). See `requireLessonContentPermission`.
 *
 * Also serves as the existence check: `getDisciplineIdForLessonId` resolves
 * the lesson directly against `lessonsTable`, so "no such lesson" (404, via
 * `absentResourceResponse`) is told apart from "lesson exists with no
 * discipline" (admin-only) here, before any guard runs.
 */
async function guard(
  request: Request,
  lessonId: number,
  action: 'read' | 'update' = 'update',
): Promise<Response | null> {
  const lookup = await getDisciplineIdForLessonId(lessonId);
  if (!lookup.found) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  try {
    await requireLessonContentPermission(
      request.headers,
      lookup.disciplineId,
      action,
    );
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

/**
 * Which video the lesson has, for the dialog's prefilled URL field. The
 * same discipline guard as the write, on READ: whoever may edit the
 * lesson's content may see what is attached. This is the only path a video
 * ref takes to the browser — the library and editor-board payloads omit it,
 * since a bare Mux ref is streamable.
 */
export async function getVideoHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const denied = await guard(request, lessonId, 'read');
  if (denied) return denied;
  const video = await getLessonVideo(lessonId);
  if (!video) return new Response('Not found', { status: 404 });
  return Response.json(video);
}

export async function putVideoHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const denied = await guard(request, lessonId);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = setLessonVideoInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid video input' }, { status: 400 });
  }

  const { provider, ref, version } = parsed.data;
  const updated = await orVersionConflict(() =>
    setLessonVideo(lessonId, provider, ref, version),
  );
  if (updated instanceof Response) return updated;
  if (!updated) return new Response('Not found', { status: 404 });

  // Auto-captions for a Mux video. Awaited (a serverless response may end
  // the work) but never allowed to fail the save — the outcome is stored on
  // `video_captions` and shown, with Retry, in the video section.
  if (provider === 'mux') {
    try {
      await requestLessonCaptionsSafely({
        lessonId,
        playbackId: ref,
        lang: PRIMARY_VIDEO_LANG,
      });
    } catch (error) {
      console.error('Captions request failed after a video save:', error);
    }
  }
  return Response.json({ ok: true });
}

export const Route = createFileRoute('/api/admin/lessons/$lessonId/video')({
  server: {
    handlers: {
      GET: ({ request, params }) => getVideoHandler(request, params.lessonId),
      PUT: ({ request, params }) => putVideoHandler(request, params.lessonId),
    },
  },
});
