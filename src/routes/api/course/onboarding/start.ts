import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import { advanceOnboarding } from '#/lib/onboarding-session.server';

/**
 * Zod strips unknown keys, which is load-bearing here rather than incidental:
 * a `userId` smuggled into the body never survives parsing, and the handler
 * only ever reads the id from the session. See the SECURITY note below.
 */
const StartBodySchema = z.object({ courseSlug: z.string().min(1) });

/**
 * Starts — or resumes — the onboarding interview for the logged-in user on one
 * course. No event is sent: the machine runs to its first settled state, which
 * produces the greeting on a fresh session and replays the settled state of a
 * session already in progress. Safe to call repeatedly.
 *
 * SECURITY: `userId` comes from `auth.api.getSession` and nowhere else — not
 * the body, not the query string, not a header. `advanceOnboarding` takes it
 * as an argument precisely so this is the only place a session is read.
 */
export async function startOnboardingHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = StartBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await advanceOnboarding({
      userId: session.user.id,
      courseSlug: parsed.data.courseSlug,
      event: null,
    });

    if (!result.ok) {
      return result.reason === 'course_not_found'
        ? Response.json({ error: 'Course not found' }, { status: 404 })
        : Response.json(
            { error: 'Onboarding session changed' },
            { status: 409 },
          );
    }

    return Response.json(result.body);
  } catch (error) {
    console.error('Failed to start onboarding:', error);
    return Response.json(
      { error: 'Failed to start onboarding' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/course/onboarding/start')({
  server: {
    handlers: {
      POST: ({ request }) => startOnboardingHandler(request),
    },
  },
});
