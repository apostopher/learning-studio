import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import { deleteOnboardingSession } from '#/lib/onboarding-session.server';

/**
 * Zod strips unknown keys, which is load-bearing here rather than incidental:
 * a `userId` smuggled into the body never survives parsing, and the handler
 * only ever reads the id from the session. See the SECURITY note below.
 */
const DeleteBodySchema = z.object({ courseSlug: z.string().min(1) });

/**
 * Withdraws everything the user shared during onboarding for one course.
 *
 * POST rather than DELETE: it carries a JSON body, and every other route in
 * this app posts its parameters. Destructive on purpose — the widget's "not
 * now" dismissal must NOT call this.
 *
 * SECURITY: `userId` comes from `auth.api.getSession` and nowhere else — not
 * the body, not the query string, not a header. On a destructive route that is
 * the whole ownership check: `deleteOnboardingSession` resolves the row from
 * (session user, slug), so no request can name another user's session.
 */
export async function deleteOnboardingHandler(
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

  const parsed = DeleteBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await deleteOnboardingSession({
      userId: session.user.id,
      courseSlug: parsed.data.courseSlug,
    });

    if (!result.ok) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    console.error('Failed to delete onboarding session:', error);
    return Response.json(
      { error: 'Failed to delete onboarding data' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/course/onboarding/delete')({
  server: {
    handlers: {
      POST: ({ request }) => deleteOnboardingHandler(request),
    },
  },
});
