import { createFileRoute } from '@tanstack/react-router';
import { getCourseLessonPosters } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/lesson-posters',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          await requireAdmin(request.headers);
        } catch (error) {
          if (error instanceof ForbiddenError) {
            return new Response('Forbidden', { status: 403 });
          }
          throw error;
        }
        const courseId = Number(params.courseId);
        if (!Number.isInteger(courseId) || courseId <= 0) {
          return Response.json({ error: 'Invalid course id' }, { status: 400 });
        }
        // No 404 branch: a course with no posters is `{}`, a real answer. The
        // board route already reports a missing course.
        return Response.json(await getCourseLessonPosters(courseId));
      },
    },
  },
});
