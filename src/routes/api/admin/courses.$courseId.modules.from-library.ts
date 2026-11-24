import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { copyDisciplineModuleIntoCourse } from '#/db/copy-discipline-module';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { copyDisciplineModuleInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireCoursePermission,
} from '#/lib/permissions.server';

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Copy a library (discipline) module into a course: a new course module with
 * the same name and its lessons placed in library order. Lessons the course
 * already teaches are skipped and named in the response.
 *
 * Guarded exactly like creating a module by hand — structure:create on the
 * destination course — since that is what it does. The lessons need no
 * separate check: the copy reads them off a discipline module of the
 * course's own org, which is all `linkLesson`'s org check establishes.
 */
export async function postModuleFromLibraryHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
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
  const parsed = copyDisciplineModuleInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await copyDisciplineModuleIntoCourse({
    courseId,
    disciplineModuleId: parsed.data.disciplineModuleId,
    afterModuleId: parsed.data.afterModuleId,
    onlyLessonId: parsed.data.onlyLessonId,
  });
  if (result === null) {
    // Another org's module, or none at all — the same answer for both, so
    // the id confirms nothing. See `absentResourceResponse`.
    return absentResourceResponse(request.headers, 'Library module not found');
  }
  const { createdVersionIds: _, ...copied } = result;
  return Response.json(copied);
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/modules/from-library',
)({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        postModuleFromLibraryHandler(request, params.courseId),
    },
  },
});
