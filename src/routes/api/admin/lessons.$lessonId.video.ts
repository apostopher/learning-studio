import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { setLessonVideo } from '#/db/admin';
import { getCourseIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { setLessonVideoInputSchema } from '#/lib/admin-schemas';
import { absentResourceResponse } from '#/lib/permissions.server';

/**
 * Video is lesson content: it changes what EVERY course teaching this lesson
 * plays, not just one. `lessons.org_id` makes it org-owned, so the guard
 * follows ownership — org-level admin — rather than any one course's staff.
 */
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

export async function putVideoHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  // Existence check only — a lesson can now have several placements, so this
  // is not "which course owns it", just "does the row exist". Resolved
  // before guarding: guarding on a null course id would misreport "no such
  // lesson" as "forbidden". The 404 is then answered only to someone on the
  // teaching side — see `absentResourceResponse`, which closes the
  // id-enumeration oracle this ordering would otherwise open.
  const lessonExistsAt = await getCourseIdForLessonId(lessonId);
  if (lessonExistsAt === null) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  const denied = await guard(request);
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
