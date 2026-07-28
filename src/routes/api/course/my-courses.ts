import { createFileRoute } from '@tanstack/react-router';
import { getMyCourses } from '#/db/course';
import { auth } from '#/lib/auth';

/**
 * The logged-in user's subscribed courses with per-course progress, for the
 * /app course list. Any authenticated user may read their own subscriptions —
 * no admin role needed.
 */
export async function getMyCoursesHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const courses = await getMyCourses(session.user.id);
    return Response.json(courses);
  } catch (error) {
    console.error('Failed to read my courses:', error);
    return Response.json({ error: 'Failed to load courses' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/course/my-courses')({
  server: {
    handlers: {
      GET: ({ request }) => getMyCoursesHandler(request),
    },
  },
});
