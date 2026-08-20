import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { getCourseLessonPosters } from '#/db/admin';
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

export async function getCourseLessonPostersHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  const denied = await guard(request, courseId);
  if (denied) return denied;

  // No 404 branch: a course with no posters is `{}`, a real answer. The
  // board route already reports a missing course.
  return Response.json(await getCourseLessonPosters(courseId));
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/lesson-posters',
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getCourseLessonPostersHandler(request, params.courseId),
    },
  },
});
