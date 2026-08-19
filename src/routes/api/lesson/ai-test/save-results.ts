import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AIEvaluationResultSchema, AITestSchema } from '#/ai/schemas';
import { saveTestResult } from '#/db/lesson-test';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';
import type { Promotion } from '#/lib/promotion.server';
import { maybePromote } from '#/lib/promotion.server';

const SaveResultsInputSchema = z.object({
  lessonSlug: z.string().min(1),
  test: AITestSchema,
  evaluations: z.array(AIEvaluationResultSchema),
  totalScore: z.number().int().min(0).max(100),
});

/**
 * Persist a completed debrief.
 *
 * Lifted out of the `createFileRoute` call so it can be tested the way every
 * other handler in this directory is — the gate below is the kind of branch
 * that must not rely on being exercised by hand.
 *
 * The prerequisite LOCKS are not checked here, matching the other two write
 * routes: honouring them would newly 403 flows that succeed today, which is a
 * separate decision. The LEVEL check is enforced.
 */
export async function saveTestResultsHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = SaveResultsInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          'Valid lessonSlug, test, evaluations, and totalScore are required',
      },
      { status: 400 },
    );
  }
  const { lessonSlug, test, evaluations, totalScore } = parsed.data;

  const gate = await evaluateLessonGate({
    userId: session.user.id,
    lessonSlug,
  });
  // Refuse an out-of-tier lesson, in BOTH read-only states: a read-only
  // archive view may show a pilot the debrief they already did, never record a
  // new one. A completed debrief sets `debriefAnswered`, which feeds
  // `lessonPercent`, which is what the gate reads to decide `readOnly`.
  //
  // `lessonLock`/`materialLock` are deliberately NOT honoured here — refusing
  // on those would newly 403 flows that succeed today, a separate decision
  // with its own blast radius. Refusing on `outOfTier` alone breaks nothing
  // that currently works: every lesson ships with `levels = '{}'`, so nothing
  // is out of tier until an author tags one.
  if (gate?.outOfTier) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // TODO: restore session.user.id when auth is re-enabled.
    //
    // NOTE: this placeholder is why the escalation path this guard closes is
    // currently inert — `debriefAnswered` matches on `user_id`, so today every
    // result lands on 'dev-user' and moves nobody's percent. The guard is
    // written against the session user regardless, so it is already correct
    // when the line below is fixed. Fixing it is a separate change: it would
    // start counting debriefs toward every learner's progress.
    const result = await saveTestResult({
      userId: 'dev-user',
      lessonSlug,
      questions: test,
      answers: evaluations,
      totalScore,
    });

    // Best-effort: a promotion-check failure must never fail the debrief the
    // pilot just completed. `gate` is null only when the lesson itself
    // doesn't exist/isn't available, in which case there is no course to
    // promote in. Checked against the real session user, not the 'dev-user'
    // placeholder above — this is already correct for when that TODO is
    // fixed.
    let promotion: Promotion | null = null;
    if (gate) {
      try {
        promotion = await maybePromote({
          userId: session.user.id,
          courseSlug: gate.courseSlug,
        });
      } catch (error) {
        console.error(
          'Promotion check failed; the debrief was still saved.',
          error,
        );
      }
    }

    return Response.json({ ...result, promotion });
  } catch (error) {
    console.error('Failed to save test result:', error);
    return Response.json(
      { error: 'Failed to save test result' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/lesson/ai-test/save-results')({
  server: {
    handlers: { POST: ({ request }) => saveTestResultsHandler(request) },
  },
});
