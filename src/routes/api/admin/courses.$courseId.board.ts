import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { getCourseBoard } from '#/db/admin';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { requireCoursePermission } from '#/lib/permissions.server';

async function guard(
  request: Request,
  courseId: number,
): Promise<Response | null> {
  try {
    await requireCoursePermission(
      request.headers,
      courseId,
      'structure',
      'read',
    );
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getCourseBoardHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  const denied = await guard(request, courseId);
  if (denied) return denied;

  const board = await getCourseBoard(courseId);
  if (!board) return new Response('Not found', { status: 404 });
  return Response.json(board);
}

export const Route = createFileRoute('/api/admin/courses/$courseId/board')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getCourseBoardHandler(request, params.courseId),
    },
  },
});
