import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { setLessonVideo } from '#/db/admin';
import { getDisciplineIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setLessonVideoInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';

/**
 * Video is lesson content: it changes what EVERY course teaching this lesson
 * plays, not just one. Authority follows the lesson's DISCIPLINE — the SME
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
): Promise<Response | null> {
  const lookup = await getDisciplineIdForLessonId(lessonId);
  if (!lookup.found) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  try {
    await requireLessonContentPermission(
      request.headers,
      lookup.disciplineId,
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
