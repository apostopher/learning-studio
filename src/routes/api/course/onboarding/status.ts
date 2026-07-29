import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import { getOnboardingProgress } from '#/lib/onboarding-session.server';

const StatusBodySchema = z.object({ courseSlug: z.string().min(1) });

/**
 * Read-only: answers whether the logged-in user has engaged with onboarding
 * for this course at all, without running the machine or writing anything.
 * Safe to call on every course-page render — see getOnboardingProgress.
 *
 * SECURITY: userId comes from auth.api.getSession and nowhere else, same
 * rule as every other route in this directory.
 */
export async function onboardingProgressHandler(
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

  const parsed = StatusBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await getOnboardingProgress({
      userId: session.user.id,
      courseSlug: parsed.data.courseSlug,
    });

    if (!result.ok) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }

    return Response.json({ status: result.status });
  } catch (error) {
    console.error('Failed to read onboarding status:', error);
    return Response.json(
      { error: 'Failed to read onboarding status' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/course/onboarding/status')({
  server: {
    handlers: {
      POST: ({ request }) => onboardingProgressHandler(request),
    },
  },
});
