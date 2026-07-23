import { createFileRoute } from '@tanstack/react-router';
import { getCourseProgress } from '#/db/course-progress';
import { auth } from '#/lib/auth';

/**
 * Aggregated progress for the logged-in user across a whole course
 * (`?slug=`) — course / module / lesson percentages in one efficient,
 * server-aggregated payload. Any authenticated user may read their own
 * progress — no admin role needed.
 */
export async function getCourseProgressHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) {
    return Response.json({ error: 'slug is required' }, { status: 400 });
  }

  try {
    const progress = await getCourseProgress({ userId: session.user.id, slug });
    return Response.json(progress);
  } catch (error) {
    console.error('Failed to read course progress:', error);
    return Response.json({ error: 'Failed to load progress' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/course/progress-summary')({
  server: {
    handlers: {
      GET: ({ request }) => getCourseProgressHandler(request),
    },
  },
});
