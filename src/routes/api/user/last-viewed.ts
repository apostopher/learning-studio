import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { recordLastViewedLesson } from '#/db/course-last-viewed';
import { auth } from '#/lib/auth';

const lastViewedSchema = z.object({
  lessonSlug: z.string().min(1),
});

/**
 * Move the logged-in user's resume pointer to a lesson. Any authenticated user
 * may move their own pointer — it is their own navigation history, and the
 * user is taken from the session, never from the body.
 *
 * The lesson's course is derived from the lesson (see recordLastViewedLesson),
 * so a forged slug cannot write a pointer into an unrelated course. The lesson
 * GATE is deliberately not re-checked here: resolveResumeTarget hops off a
 * locked pointer when reading, so the worst a forged write achieves is
 * redirecting the forger to a lesson they still cannot open — not worth a full
 * progress aggregation on every lesson view.
 */
export async function recordLastViewedHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = lastViewedSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const recorded = await recordLastViewedLesson({
      userId: session.user.id,
      lessonSlug: parsed.data.lessonSlug,
    });
    if (!recorded) {
      return Response.json({ error: 'Lesson not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Failed to record last viewed lesson:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }

  return Response.json(
    { message: 'Last viewed lesson saved' },
    { status: 201 },
  );
}

export const Route = createFileRoute('/api/user/last-viewed')({
  server: {
    handlers: {
      POST: ({ request }) => recordLastViewedHandler(request),
    },
  },
});
