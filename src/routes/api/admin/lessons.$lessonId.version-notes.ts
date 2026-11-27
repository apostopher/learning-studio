import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { getDisciplineIdForLessonId } from '#/db/lesson-access';
import {
  getLessonVersionNotes,
  setLessonVersionNotes,
} from '#/db/lesson-version-notes';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setLessonVersionNotesInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';

/**
 * A lesson's version notes: the SME's running log of what changed.
 * The same authority as the version itself — the lesson's discipline, or an
 * org admin when it has none.
 */
async function authorize(
  request: Request,
  rawLessonId: string,
  action: 'read' | 'update',
): Promise<{ lessonId: number } | { response: Response }> {
  const lessonId = Number(rawLessonId);
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return {
      response: Response.json({ error: 'Invalid lesson id' }, { status: 400 }),
    };
  }
  const lookup = await getDisciplineIdForLessonId(lessonId);
  if (!lookup.found) {
    return {
      response: await absentResourceResponse(
        request.headers,
        'Lesson not found',
      ),
    };
  }
  try {
    await requireLessonContentPermission(
      request.headers,
      lookup.disciplineId,
      action,
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { response: new Response('Forbidden', { status: 403 }) };
    }
    throw error;
  }
  return { lessonId };
}

export async function getVersionNotesHandler(
  request: Request,
  rawLessonId: string,
): Promise<Response> {
  const authorized = await authorize(request, rawLessonId, 'read');
  if ('response' in authorized) return authorized.response;
  const notes = await getLessonVersionNotes(authorized.lessonId);
  return Response.json({ notes });
}

export async function putVersionNotesHandler(
  request: Request,
  rawLessonId: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const input = setLessonVersionNotesInputSchema.safeParse(body);
  if (!input.success) {
    return Response.json(
      { error: input.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 },
    );
  }
  const authorized = await authorize(request, rawLessonId, 'update');
  if ('response' in authorized) return authorized.response;
  await setLessonVersionNotes(authorized.lessonId, input.data.notes);
  return Response.json({ notes: input.data.notes });
}

export const Route = createFileRoute(
  '/api/admin/lessons/$lessonId/version-notes',
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getVersionNotesHandler(request, params.lessonId),
      PUT: ({ request, params }) =>
        putVersionNotesHandler(request, params.lessonId),
    },
  },
});
