import { createFileRoute } from '@tanstack/react-router';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { AIEvaluationResultSchema, AITestSchema } from '#/ai/schemas';
import { getDebriefFacts, saveTestResult } from '#/db/lesson-test';
import { auth } from '#/lib/auth';
import { getDebriefAccess } from '#/lib/debrief-access.server';
import { debriefNotOpen } from '#/lib/debrief-not-open';
import {
  computeDebriefState,
  DEBRIEF_DELAY_MS,
  type DebriefState,
  isPass,
} from '#/lib/debrief-schedule';
import { prepareDebrief } from '#/lib/prepared-debrief.server';
import { settleProgress } from '#/lib/settle-progress.server';

const SaveResultsInputSchema = z.object({
  lessonSlug: z.string().min(1),
  // The course the learner is in, from the route they are on — a lesson can
  // be placed in several courses, each with its own gate, so it cannot be
  // inferred from the slug.
  courseSlug: z.string().min(1),
  test: AITestSchema,
  evaluations: z.array(AIEvaluationResultSchema),
  totalScore: z.number().int().min(0).max(100),
});

/**
 * Persist a completed debrief, for the session user.
 *
 * Lifted out of the `createFileRoute` call so it can be tested the way every
 * other handler in this directory is.
 *
 * Asks `getDebriefAccess` first, like `generate`: a non-subscriber, a
 * prerequisite-locked lesson, an out-of-tier lesson (in BOTH read-only states
 * — an archive view may show a pilot the debrief they already did, never
 * record a new one) and a lesson with no debrief are refused before anything
 * is written. A debrief that is not open NOW is refused with 409 — a stale
 * second tab submitting after the debrief relocked must not add an attempt.
 *
 * Every refusal comes before the write, because what this writes is what the
 * debrief schedule, course percent and promotion read.
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
          'Valid lessonSlug, courseSlug, test, evaluations, and totalScore are required',
      },
      { status: 400 },
    );
  }
  const { lessonSlug, courseSlug, test, evaluations, totalScore } = parsed.data;
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

    const result = await saveTestResult({
      userId,
      lessonSlug,
      questions: test,
      answers: evaluations,
      totalScore,
    });

    // Below par: the debrief relocks for 24h, then reopens with a FRESH set.
    // Generate it now, in the background, so it is ready when it reopens. Not
    // awaited — the pilot is waiting on this response, not on the model.
    if (!isPass(totalScore)) {
      waitUntil(
        prepareDebrief({ userId, courseId: access.courseId, lessonSlug }).catch(
          (error: unknown) => {
            console.error('Failed to prepare debrief retake:', error);
          },
        ),
      );
    }

    // Best-effort: `settleProgress` never throws, so a settle failure cannot
    // fail the debrief the pilot just completed.
    const promotion = await settleProgress({ userId, courseSlug });

    const state = await stateAfterSave({
      userId,
      lessonSlug,
      lessonId: access.lessonId,
      totalScore,
      completedAt: result.completedAt,
    });

    return Response.json({ ...result, promotion, state });
  } catch (error) {
    console.error('Failed to save test result:', error);
    return Response.json(
      { error: 'Failed to save test result' },
      { status: 500 },
    );
  }
}

/**
 * The debrief's state now that this attempt is recorded, so the client can
 * show "passed" or "next attempt opens …" without a second round trip.
 *
 * Re-read from Postgres — the same facts every other reader uses, which also
 * catches a pass recorded meanwhile in another tab. If that read fails the
 * attempt is still saved, so answer from the attempt itself rather than 500:
 * the state was `open` a moment ago, so `doneAt` is at least 24h old and a
 * below-par attempt reopens exactly 24h after it was completed.
 */
async function stateAfterSave({
  userId,
  lessonSlug,
  lessonId,
  totalScore,
  completedAt,
}: {
  userId: string;
  lessonSlug: string;
  lessonId: number;
  totalScore: number;
  completedAt: Date | null;
}): Promise<DebriefState> {
  try {
    const facts = await getDebriefFacts(userId, lessonSlug, lessonId);
    return computeDebriefState(facts, new Date());
  } catch (error) {
    console.error('Failed to re-read debrief facts after save:', error);
    if (isPass(totalScore)) return { kind: 'passed' };
    const attemptMs = (completedAt ?? new Date()).getTime();
    return {
      kind: 'retake-waiting',
      availableAt: new Date(attemptMs + DEBRIEF_DELAY_MS).toISOString(),
    };
  }
}
export const Route = createFileRoute('/api/lesson/ai-test/save-results')({
  server: {
    handlers: { POST: ({ request }) => saveTestResultsHandler(request) },
  },
});
