import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { recordLastViewedLesson } from '#/db/course-last-viewed';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

const lastViewedSchema = z.object({
  lessonSlug: z.string().min(1),
});

/**
 * Move the logged-in user's resume pointer to a lesson. Any authenticated user
 * may move their own pointer — it is their own navigation history, and the
 * user is taken from the session, never from the body.
 *
 * The lesson's course is derived from the lesson (see recordLastViewedLesson),
 * so a forged slug cannot write a pointer into an unrelated course. The
 * prerequisite LOCKS are deliberately not re-checked here: resolveResumeTarget
 * hops off a locked pointer when reading, so the worst a forged write achieves
 * is redirecting the forger to a lesson they still cannot open — not worth a
 * full progress aggregation on every lesson view.
 *
 * The LEVEL check is not in that category and is enforced, because a resume
 * pointer parked on an out-of-tier lesson sends the pilot to a page they will
 * be refused, every time they return to the app.
 */
export async function recordLastViewedHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = lastViewedSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const gate = await evaluateLessonGate({
    userId: session.user.id,
    lessonSlug: parsed.data.lessonSlug,
  });
  // Refuse an out-of-tier lesson, in BOTH read-only states: this is a write,
  // and an archive view must not write anything. It matters because what it
  // writes feeds `lessonPercent`, and percent is exactly what the gate reads
  // to decide `readOnly` — so a caller could POST their way from a
  // `403 out-of-tier` to a 200 serving the full material.
  //
  // `lessonLock`/`materialLock` are deliberately NOT honoured here. Refusing
  // on those would newly 403 flows that succeed today, which is a separate
  // decision with its own blast radius (see this handler's doc comment).
  // Refusing on `outOfTier` alone breaks nothing that currently works: every
  // lesson ships with `levels = '{}'`, so nothing is out of tier until an
  // author tags one — which is precisely when this should start to bite.
  if (gate?.outOfTier) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const recorded = await recordLastViewedLesson({
      userId: session.user.id,
      lessonSlug: parsed.data.lessonSlug,
    });
    if (!recorded) {
      return Response.json({ error: 'Lesson not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Failed to record last viewed lesson:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }

  return Response.json(
    { message: 'Last viewed lesson saved' },
    { status: 201 },
  );
}

export const Route = createFileRoute('/api/user/last-viewed')({
  server: {
    handlers: {
      POST: ({ request }) => recordLastViewedHandler(request),
    },
  },
});
