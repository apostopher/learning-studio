import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { unremixCourse } from '#/db/course-remixes';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { requireCoursePermission } from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Un-remix: drop the link and every borrowed placement. Guarded on the
 * REMIXER only (spec, Permissions row 1 — "remove from B's rail" is B's
 * authority); no rights on the source are needed to stop borrowing from it.
 */
export async function deleteRemixHandler(
  request: Request,
  courseIdRaw: string,
  sourceCourseIdRaw: string,
): Promise<Response> {
  const courseId = parseId(courseIdRaw);
  const sourceCourseId = parseId(sourceCourseIdRaw);
  if (courseId === null || sourceCourseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  try {
    await requireCoursePermission(
      request.headers,
      courseId,
      'structure',
      'update',
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  const result = await unremixCourse({
    orgId: getActiveOrgId(),
    courseId,
    sourceCourseId,
  });
  if (result.ok) return Response.json({ moduleCount: result.moduleCount });
  return Response.json({ error: 'Remix not found' }, { status: 404 });
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/remixes/$sourceCourseId',
)({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        deleteRemixHandler(request, params.courseId, params.sourceCourseId),
    },
  },
});
