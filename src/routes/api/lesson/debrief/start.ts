import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import { getDebriefAccess } from '#/lib/debrief-access.server';
import { startOrResumeAttempt } from '#/lib/debrief-attempt.server';
import { debriefNotOpen } from '#/lib/debrief-not-open';

/**
 * `courseSlug` because a lesson can be placed in several courses, each with
 * its own gate and credentials, so it cannot be inferred from the slug.
 */
const StartInputSchema = z.object({
  lessonSlug: z.string().min(1),
  courseSlug: z.string().min(1),
});

/**
 * Start this pilot's debrief attempt, or resume the open one. Returns the
 * questions (text only — never expected answers or chunk tags), the answers
 * given so far, the saved draft and mastery so far. See
 * `startOrResumeAttempt`.
 *
 * `getDebriefAccess` decides first, before any source lookup or model call:
 * a refusal costs no tokens. A debrief that exists but is not open now (not
 * done, waiting, waiting to retake, passed) is a 409 with `debriefNotOpen`'s
 * body. An open attempt always reads as open (`resume`), whatever the clock.
 */
export async function startDebriefHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = StartInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'lessonSlug and courseSlug are required' },
      { status: 400 },
    );
  }
  const { lessonSlug, courseSlug } = parsed.data;
  const userId = session.user.id;

  try {
    const access = await getDebriefAccess({
      userId,
      lessonSlug,
      courseSlug,
      now: new Date(),
    });
    if (!access.ok) {
      return new Response(access.status === 404 ? 'Not Found' : 'Forbidden', {
        status: access.status,
      });
    }
    if (access.state.kind !== 'open') {
      return debriefNotOpen(access.state);
    }

    const result = await startOrResumeAttempt({
      userId,
      courseId: access.courseId,
      lessonId: access.lessonId,
      lessonSlug,
    });
    if (!result.ok) {
      if (result.reason === 'passed') return debriefNotOpen({ kind: 'passed' });
      // Not a 500: nothing is broken. The lesson has nothing to build a
      // debrief from, and the UI does not offer one.
      return Response.json(
        { error: 'This lesson has no debrief source' },
        { status: 422 },
      );
    }
    return Response.json(result.attempt);
  } catch (error) {
    console.error('Failed to start debrief:', error);
    return Response.json({ error: 'Failed to start debrief' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/lesson/debrief/start')({
  server: {
    handlers: { POST: ({ request }) => startDebriefHandler(request) },
  },
});
