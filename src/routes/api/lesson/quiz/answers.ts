import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { saveLessonQuizAnswers } from '#/db/lesson-quiz';
import { auth } from '#/lib/auth';
import { CourseLessonQuizAnswersSchema } from '#/types';

const SubmitQuizInputSchema = z.object({
  lessonSlug: z.string().min(1),
  answers: CourseLessonQuizAnswersSchema.min(1),
});

/**
 * Record one attempt at a lesson's authored quiz.
 *
 * `userId` comes from the session and is never read from the body — the
 * previous implementation of this endpoint parsed the body and then overwrote
 * `userId` with the authenticated one, which worked but left a request shape
 * that looks like it accepts a user id.
 */
export async function submitLessonQuizHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const parsed = SubmitQuizInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: 'A lessonSlug and at least one answer are required' },
      { status: 400 },
    );
  }

  try {
    const row = await saveLessonQuizAnswers({
      userId: session.user.id,
      lessonSlug: parsed.data.lessonSlug,
      answers: parsed.data.answers,
    });
    return Response.json(row);
  } catch (error) {
    console.error('Failed to save lesson quiz answers:', error);
    return Response.json(
      { error: 'Failed to save quiz answers' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/lesson/quiz/answers')({
  server: {
    handlers: {
      POST: ({ request }) => submitLessonQuizHandler(request),
    },
  },
});
