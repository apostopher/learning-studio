import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import { getDebriefAccess } from '#/lib/debrief-access.server';
import { continueAttempt, getAttemptOwner } from '#/lib/debrief-attempt.server';
import { settleProgress } from '#/lib/settle-progress.server';

const ContinueInputSchema = z.object({
  // The course the pilot is in, for the gate and its pass mark.
  courseSlug: z.string().min(1),
  attemptId: z.number().int().positive(),
  choice: z.enum(['yes', 'no']),
});

/**
 * The pilot's answer to the offer of set 2 after passing set 1. See
 * `continueAttempt`: `yes` returns set 2's questions, `no` finishes the
 * attempt at its pass.
 *
 * Gated as `answer` is: 403 for an unknown attempt or another pilot's, and
 * `getDebriefAccess` on the attempt's lesson in the named course (not the
 * schedule). 409 when there is no offer to answer (finished, already taken
 * up, or none was made). A `no` that records a new pass settles progress and
 * returns the promotion, as `answer` does.
 */
export async function continueDebriefHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ContinueInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "courseSlug, attemptId and a choice of 'yes' or 'no' are required",
      },
      { status: 400 },
    );
  }
  const { courseSlug, attemptId, choice } = parsed.data;
  const userId = session.user.id;
  const forbidden = () => new Response('Forbidden', { status: 403 });

  try {
    const owner = await getAttemptOwner(attemptId);
    if (!owner || owner.userId !== userId) return forbidden();

    const access = await getDebriefAccess({
      userId,
      lessonSlug: owner.lessonSlug,
      courseSlug,
      now: new Date(),
    });
    if (!access.ok) {
      return new Response(access.status === 404 ? 'Not Found' : 'Forbidden', {
        status: access.status,
      });
    }

    const result = await continueAttempt({
      userId,
      attemptId,
      choice,
      courseId: access.courseId,
    });
    if (!result.ok) {
      return result.reason === 'no-offer'
        ? Response.json({ error: 'no-offer' }, { status: 409 })
        : forbidden();
    }
    const { ok: _ok, ...response } = result;
    if (response.choice === 'yes') return Response.json(response);
    // A "no" that recorded a new pass settles progress, as an answer does.
    const promotion = response.passedNow
      ? await settleProgress({ userId, courseSlug })
      : null;
    return Response.json({ ...response, promotion });
  } catch (error) {
    console.error('Failed to continue debrief:', error);
    return Response.json(
      { error: 'Failed to continue the debrief' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/lesson/debrief/continue')({
  server: {
    handlers: { POST: ({ request }) => continueDebriefHandler(request) },
  },
});
