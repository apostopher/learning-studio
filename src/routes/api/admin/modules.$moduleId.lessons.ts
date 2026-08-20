import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { createLesson } from '#/db/admin';
import { getCourseIdForModuleId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { createLessonInputSchema } from '#/lib/admin-schemas';
import { requireCoursePermission } from '#/lib/permissions.server';

function parseModuleId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function postLessonHandler(
  request: Request,
  moduleIdRaw: string,
): Promise<Response> {
  const moduleId = parseModuleId(moduleIdRaw);
  if (moduleId === null) {
    return Response.json({ error: 'Invalid module id' }, { status: 400 });
  }
  // Resolve the course before guarding: a module that doesn't exist must
  // 404, not 403 — guarding on a null course id would misreport "no such
  // module" as "forbidden".
  const courseId = await getCourseIdForModuleId(moduleId);
  if (courseId === null) {
    return Response.json({ error: 'Module not found' }, { status: 404 });
  }
  try {
    await requireCoursePermission(
      request.headers,
      courseId,
      'structure',
      'create',
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createLessonInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(
    await createLesson({ moduleId, name: parsed.data.name }),
  );
}

export const Route = createFileRoute('/api/admin/modules/$moduleId/lessons')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        postLessonHandler(request, params.moduleId),
    },
  },
});
