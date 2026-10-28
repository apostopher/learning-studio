import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { saveLessonQuizAnswers } from '#/db/lesson-quiz';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';
import { settleProgress } from '#/lib/settle-progress.server';
import { CourseLessonQuizAnswersSchema } from '#/types';

const SubmitQuizInputSchema = z.object({
  lessonSlug: z.string().min(1),
  // The course the learner is in, from the route they are on — a lesson can
  // be placed in several courses, each with its own gate, so it cannot be
  // inferred from the slug.
  courseSlug: z.string().min(1),
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
 * The LEVEL check and the prerequisite and video LOCKS are all enforced: a
 * saved attempt moves progress, and progress completes lessons.
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
      {
        error:
          'A lessonSlug, a courseSlug and at least one answer are required',
      },
      { status: 400 },
    );
  }

  const gate = await evaluateLessonGate({
    userId: session.user.id,
    lessonSlug: parsed.data.lessonSlug,
    courseSlug: parsed.data.courseSlug,
  });
  // A signed-in caller is not automatically a subscriber. `evaluateLessonGate`
  // has always answered this question; this route just never asked it. It is
  // load-bearing now: what this writes can take a lesson to 100%, and in a
  // video-less course `settleProgress` then records the completion and runs
  // promotion, which can write a durable level row and send a real promotion
  // email — for a course the caller does not own. A null gate (no such
  // lesson, or a WIP one) collapses into the same 403 rather than a
  // distinguishable 404, matching report-video-progress and the playback
  // route: telling the two apart hands an enumeration oracle to any signed-in
  // caller.
  if (!gate?.subscribed) {
    return new Response('Forbidden', { status: 403 });
  }

  // Refuse an out-of-tier lesson, in BOTH read-only states: this is a write,
  // and an archive view must not write anything. It matters because a saved
  // attempt feeds `quizPlayed`, which feeds `lessonPercent`; a lesson reaching
  // 100% is recorded as the sticky `done`, and `done` is exactly what the gate
  // reads to decide `readOnly` — so an unrefused caller could POST their way
  // from a `403 out-of-tier` to a 200 serving the full material.
  //
  // Under strict levels an untagged lesson, a lesson at another level, and
  // every lesson for a pilot with no level is either refused outright or held
  // only as a read-only archive, so a write to it has no legitimate origin.
  if (gate?.outOfTier) {
    return new Response('Forbidden', { status: 403 });
  }

  // Refuse a locked lesson too, prerequisite or video. The quiz only renders
  // inside material the gate released, so a write here has no legitimate
  // origin — and what it writes can take a video-less lesson to 100%, record
  // it done, and unlock the next lesson without the pilot having earned it.
  // Same 403 as every other refusal, so the route is not an oracle.
  if (gate.lessonLock.kind !== 'open' || gate.materialLock.kind !== 'open') {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const row = await saveLessonQuizAnswers({
      userId: session.user.id,
      lessonSlug: parsed.data.lessonSlug,
      answers: parsed.data.answers,
    });

    // Best-effort: `settleProgress` never throws, so a settle failure cannot
    // fail the quiz attempt the pilot just recorded.
    const promotion = await settleProgress({
      userId: session.user.id,
      courseSlug: gate.courseSlug,
    });

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
