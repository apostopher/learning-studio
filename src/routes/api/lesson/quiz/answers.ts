import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { saveLessonQuizAnswers } from '#/db/lesson-quiz';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';
import type { Promotion } from '#/lib/promotion.server';
import { maybePromote } from '#/lib/promotion.server';
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
 *
 * The prerequisite LOCKS are deliberately not checked here, matching the
 * other write routes: honouring them would newly 403 flows that succeed
 * today, which is a separate decision. The LEVEL check is enforced.
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

  const gate = await evaluateLessonGate({
    userId: session.user.id,
    lessonSlug: parsed.data.lessonSlug,
  });
  // Refuse an out-of-tier lesson, in BOTH read-only states: this is a write,
  // and an archive view must not write anything. It matters because a saved
  // attempt feeds `quizPlayed`, which feeds `lessonPercent`, which is exactly
  // what the gate reads to decide `readOnly` — so an unrefused caller could
  // POST their way from a `403 out-of-tier` to a 200 serving the full
  // material.
  //
  // `lessonLock`/`materialLock` are deliberately NOT honoured here. Refusing
  // on those would newly 403 flows that succeed today, which is a separate
  // decision with its own blast radius. Refusing on `outOfTier` alone breaks
  // nothing that currently works: every lesson ships with `levels = '{}'`, so
  // nothing is out of tier until an author tags one — which is precisely when
  // this should start to bite.
  if (gate?.outOfTier) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const row = await saveLessonQuizAnswers({
      userId: session.user.id,
      lessonSlug: parsed.data.lessonSlug,
      answers: parsed.data.answers,
    });

    // Best-effort: a promotion-check failure must never fail the quiz
    // attempt the pilot just recorded. `gate` is null only when the lesson
    // itself doesn't exist/isn't available, in which case there is no course
    // to promote in.
    let promotion: Promotion | null = null;
    if (gate) {
      try {
        promotion = await maybePromote({
          userId: session.user.id,
          courseSlug: gate.courseSlug,
        });
      } catch (error) {
        console.error(
          'Promotion check failed; the quiz attempt was still recorded.',
          error,
        );
      }
    }

    return Response.json({ ...row, promotion });
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
