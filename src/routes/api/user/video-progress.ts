import { createFileRoute } from '@tanstack/react-router';
import { getLessonIdBySlug } from '#/db/lesson-access';
import { getLessonProgress } from '#/db/videos-progress';
import { auth } from '#/lib/auth';

/**
 * Read the logged-in user's progress for a single lesson (`?lessonSlug=`) —
 * the milestones they've reached and whether it counts as watched. Any
 * authenticated user may read their own progress — no admin role needed.
 *
 * No gate check here, deliberately: a locked lesson's progress is always
 * zero (nothing can have been recorded against it — see the write path's
 * authorization in report-video-progress.ts), so reading it back leaks
 * nothing. Only the write path needs authorizing.
 */
export async function getVideoProgressHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const lessonSlug = new URL(request.url).searchParams.get('lessonSlug');
  if (!lessonSlug) {
    return Response.json({ error: 'lessonSlug is required' }, { status: 400 });
  }

  try {
    const lessonId = await getLessonIdBySlug(lessonSlug);
    if (lessonId === null) {
      return new Response('Forbidden', { status: 403 });
    }

    const progress = await getLessonProgress({
      userId: session.user.id,
      lessonId,
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
