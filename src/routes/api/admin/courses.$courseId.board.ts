import { createFileRoute } from '@tanstack/react-router';
import { getCourseBoard } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';

export const Route = createFileRoute('/api/admin/courses/$courseId/board')({
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
        const board = await getCourseBoard(courseId);
        if (!board) return new Response('Not found', { status: 404 });
        return Response.json(board);
      },
    },
  },
});
