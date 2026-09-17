import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import {
  getLessonAlternateVideos,
  removeLessonAlternateVideo,
  setLessonAlternateVideo,
} from '#/db/admin';
import { getDisciplineIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  removeLessonAlternateVideoInputSchema,
  setLessonAlternateVideoInputSchema,
} from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';

/**
 * Translated videos are lesson content, exactly like the primary ref — same
 * discipline-scoped guard as `lessons.$lessonId.video.ts`, and the same
 * "no such lesson" handling via `absentResourceResponse`.
 */
async function guard(
  request: Request,
  lessonId: number,
  action: 'read' | 'update',
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

async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function getAlternateVideosHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const denied = await guard(request, lessonId, 'read');
  if (denied) return denied;
  const rows = await getLessonAlternateVideos(lessonId);
  if (rows === null) return new Response('Not found', { status: 404 });
  return Response.json(rows);
}

export async function putAlternateVideoHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const denied = await guard(request, lessonId, 'update');
  if (denied) return denied;
  const parsed = setLessonAlternateVideoInputSchema.safeParse(
    await readJson(request),
  );
  if (!parsed.success) {
    return Response.json({ error: 'Invalid alternate video' }, { status: 400 });
  }
  const updated = await setLessonAlternateVideo(lessonId, parsed.data);
  if (!updated) return new Response('Not found', { status: 404 });
  return Response.json({ ok: true });
}

export async function deleteAlternateVideoHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const denied = await guard(request, lessonId, 'update');
  if (denied) return denied;
  const parsed = removeLessonAlternateVideoInputSchema.safeParse(
    await readJson(request),
  );
  if (!parsed.success) {
    return Response.json({ error: 'Invalid language' }, { status: 400 });
  }
  const updated = await removeLessonAlternateVideo(lessonId, parsed.data.lang);
  if (!updated) return new Response('Not found', { status: 404 });
  return Response.json({ ok: true });
}

export const Route = createFileRoute(
  '/api/admin/lessons/$lessonId/alternate-videos',
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getAlternateVideosHandler(request, params.lessonId),
      PUT: ({ request, params }) =>
        putAlternateVideoHandler(request, params.lessonId),
      DELETE: ({ request, params }) =>
        deleteAlternateVideoHandler(request, params.lessonId),
    },
  },
});
