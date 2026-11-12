import { createFileRoute } from '@tanstack/react-router';
import { getMyCourses } from '#/db/course';
import { auth } from '#/lib/auth';
import { FLAGSHIP_COURSE_SLUG } from '#/lib/flagship-course';

/**
 * The logged-in user's subscribed courses with per-course progress, for the
 * /app course list. Any authenticated user may read their own subscriptions —
 * no admin role needed.
 *
 * Never 3D Airmanship (tester, 2026-11-12): it is the library remixed into
 * every course, not a course, so its lessons already sit inside each course a
 * pilot is enrolled in. A card for it would list the same lessons twice.
 */
export async function getMyCoursesHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const courses = await getMyCourses(session.user.id);
    return Response.json(
      courses.filter((course) => course.slug !== FLAGSHIP_COURSE_SLUG),
    );
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
