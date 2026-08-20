import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { setLessonVideo } from '#/db/admin';
import { getCourseIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setLessonVideoInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireCoursePermission,
} from '#/lib/permissions.server';

/** Video is content: only a subject expert may set it. */
async function guard(
  request: Request,
  courseId: number,
): Promise<Response | null> {
  try {
    await requireCoursePermission(
      request.headers,
      courseId,
      'content',
      'update',
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

export async function putVideoHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  // Resolve the course before guarding: guarding on a null course id would
  // misreport "no such lesson" as "forbidden". The 404 is then answered only
  // to someone on the teaching side — see `absentResourceResponse`, which
  // closes the id-enumeration oracle this ordering would otherwise open.
  const courseId = await getCourseIdForLessonId(lessonId);
  if (courseId === null) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  const denied = await guard(request, courseId);
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

  const updated = await setLessonVideo(
    lessonId,
    parsed.data.provider,
    parsed.data.ref,
  );
  if (!updated) return new Response('Not found', { status: 404 });
  return Response.json({ ok: true });
}

export const Route = createFileRoute('/api/admin/lessons/$lessonId/video')({
  server: {
    handlers: {
      PUT: ({ request, params }) => putVideoHandler(request, params.lessonId),
    },
  },
});
