import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { evaluateFreeText, evaluateMCQ } from '#/ai/evaluate-answer';
import {
  type AITestFreeTextQuestion,
  type AITestMCQQuestion,
  AITestQuestionSchema,
} from '#/ai/schemas';
import { auth } from '#/lib/auth';
import { resolveDebriefSource } from '#/lib/lesson-debrief-source.server';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

/**
 * `lessonSlug` replaces the `keyPoints`/`text` the body used to carry: the
 * grader's reference material is resolved server-side from the lesson, the same
 * way the questions themselves are (see `resolveDebriefSource`). Without it, a
 * transcript-sourced debrief could generate questions and then fail to grade
 * the free-text ones — the client has no material to send.
 */
const EvaluateInputSchema = z.object({
  lessonSlug: z.string().min(1),
  question: AITestQuestionSchema,
  userAnswer: z.string(),
});

export async function evaluateAnswerHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = EvaluateInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'lessonSlug, a valid question, and userAnswer are required' },
      { status: 400 },
    );
  }
  const { lessonSlug, question, userAnswer } = parsed.data;

  try {
    // MCQ is graded deterministically from the question itself and needs no
    // lesson content, so it answers before the gate and source lookup —
    // exactly as it did when it was evaluated client-side.
    if (question.type === 'mcq') {
      return Response.json(
        evaluateMCQ(question as AITestMCQQuestion, userAnswer),
      );
    }

    const gate = await evaluateLessonGate({
      userId: session.user.id,
      lessonSlug,
    });
    if (
      !gate ||
      !gate.subscribed ||
      gate.lessonLock.kind !== 'open' ||
      gate.materialLock.kind !== 'open'
    ) {
      return new Response('Forbidden', { status: 403 });
    }

    const source = await resolveDebriefSource(lessonSlug);
    if (!source) {
      return Response.json(
        { error: 'This lesson has no debrief source' },
        { status: 422 },
      );
    }

    const result = await evaluateFreeText(
      question as AITestFreeTextQuestion,
      userAnswer,
      source.keyPoints,
      source.text,
    );
    return Response.json(result);
  } catch (error) {
    console.error('Failed to evaluate answer:', error);
    return Response.json(
      { error: 'Failed to evaluate answer' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/lesson/ai-test/evaluate')({
  server: {
    handlers: { POST: ({ request }) => evaluateAnswerHandler(request) },
  },
});
