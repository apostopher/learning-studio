import { createFileRoute } from '@tanstack/react-router';
import { auth } from '#/lib/auth';
import { getNewsForUser } from '#/lib/news.server';

/**
 * One learner's news feed for one course (`?courseSlug=`): duplicate coverage
 * already collapsed, muted and inactive sources already removed, plus the
 * source list the picker needs and a freshness timestamp.
 *
 * Enforces the subscription itself rather than trusting the page route's
 * guard — this endpoint is independently reachable.
 */
export async function getNewsHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const courseSlug = new URL(request.url).searchParams.get('courseSlug');
  if (!courseSlug) {
    return Response.json({ error: 'courseSlug is required' }, { status: 400 });
  }

  try {
    const result = await getNewsForUser({
      userId: session.user.id,
      courseSlug,
    });
    if (!result) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }
    return Response.json(result);
  } catch (error) {
    console.error('Failed to read course news:', error);
    return Response.json({ error: 'Failed to load news' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/course/news')({
  server: {
    handlers: {
      GET: ({ request }) => getNewsHandler(request),
    },
  },
});
