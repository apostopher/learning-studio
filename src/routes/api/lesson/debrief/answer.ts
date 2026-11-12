import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  AnswerMetricsSchema,
  DEBRIEF_ANSWER_MAX_CHARS,
} from '#/lib/answer-metrics';
import { auth } from '#/lib/auth';
import { getDebriefAccess } from '#/lib/debrief-access.server';
import { answerQuestion, getAttemptOwner } from '#/lib/debrief-attempt.server';
import { settleProgress } from '#/lib/settle-progress.server';

const AnswerInputSchema = z.object({
  // The course the pilot is in, for the gate and for `settleProgress`.
  courseSlug: z.string().min(1),
  attemptId: z.number().int().positive(),
  questionId: z.string().min(1),
  answer: z
    .string()
    .max(DEBRIEF_ANSWER_MAX_CHARS)
    .refine((s) => s.trim().length > 0, 'answer is empty'),
  metrics: AnswerMetricsSchema,
});

/**
 * Grade one answer of the session pilot's attempt and record it. See
 * `answerQuestion`. A repeat of an answer already recorded returns the stored
 * result with no new grading.
 *
 * 403 for an unknown attempt, another pilot's, a legacy one or a finished one
 * (except a repeat, which returns what was recorded); 400 for an answer out
 * of order. The lesson gate (`getDebriefAccess`) applies too, but not the
 * schedule: an attempt that is open stays answerable.
 *
 * When the answer finishes the attempt, progress is settled (lesson
 * completions, then the promotion check) as `save-results` used to, and the
 * promotion is returned.
 */
export async function answerDebriefHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = AnswerInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          'courseSlug, attemptId, questionId, a non-empty answer and metrics are required',
      },
      { status: 400 },
    );
  }
  const { courseSlug, attemptId, questionId, answer, metrics } = parsed.data;
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

    const result = await answerQuestion({
      userId,
      attemptId,
      questionId,
      answer,
      metrics,
      lessonId: access.lessonId,
      courseId: access.courseId,
    });
    if (!result.ok) {
      return result.reason === 'out-of-order'
        ? Response.json(
            { error: 'Answer the questions in order' },
            { status: 400 },
          )
        : forbidden();
    }

    // Best-effort: `settleProgress` never throws, so a settle failure cannot
    // fail the answer the pilot just gave.
    const promotion = result.finished
      ? await settleProgress({ userId, courseSlug })
      : null;
    const { ok: _ok, ...response } = result;
    return Response.json({ ...response, promotion });
  } catch (error) {
    console.error('Failed to answer debrief question:', error);
    return Response.json(
      { error: 'Failed to grade the answer' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/lesson/debrief/answer')({
  server: {
    handlers: { POST: ({ request }) => answerDebriefHandler(request) },
  },
});
