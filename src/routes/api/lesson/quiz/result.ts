import { createFileRoute } from '@tanstack/react-router';
import { getLatestLessonQuizAnswers } from '#/db/lesson-quiz';
import { auth } from '#/lib/auth';

/**
 * The student's latest attempt at a lesson's authored quiz, or `null` if they
 * have never taken it. Scoped to the session user — a lessonSlug is the only
 * thing the caller gets to choose.
 */
export async function getLessonQuizResultHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const lessonSlug = new URL(request.url).searchParams.get('lessonSlug');
  if (!lessonSlug) {
    return new Response('lessonSlug is required', { status: 400 });
  }

  try {
    const row = await getLatestLessonQuizAnswers(session.user.id, lessonSlug);
    return Response.json(row);
  } catch (error) {
    console.error('Failed to load lesson quiz result:', error);
    return Response.json(
      { error: 'Failed to load quiz result' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/lesson/quiz/result')({
  server: {
    handlers: {
      GET: ({ request }) => getLessonQuizResultHandler(request),
    },
  },
});
