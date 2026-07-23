import { createFileRoute } from '@tanstack/react-router';
import { getVideoProgress } from '#/db/videos-progress';
import { auth } from '#/lib/auth';

/**
 * Read the logged-in user's progress for a single video (`?videoId=`) — the
 * milestones they've reached and whether it counts as watched. Any
 * authenticated user may read their own progress — no admin role needed.
 */
export async function getVideoProgressHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const videoId = new URL(request.url).searchParams.get('videoId');
  if (!videoId) {
    return Response.json({ error: 'videoId is required' }, { status: 400 });
  }

  try {
    const progress = await getVideoProgress({
      userId: session.user.id,
      videoId,
    });
    return Response.json(progress);
  } catch (error) {
    console.error('Failed to read video progress:', error);
    return Response.json({ error: 'Failed to load progress' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/user/video-progress')({
  server: {
    handlers: {
      GET: ({ request }) => getVideoProgressHandler(request),
    },
  },
});
