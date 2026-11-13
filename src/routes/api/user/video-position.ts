import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getLessonIdBySlug } from '#/db/lesson-access';
import { saveResumePosition } from '#/db/video-resume-positions';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

const saveVideoPositionSchema = z.object({
  lessonSlug: z.string().min(1),
  // A lesson can sit in several courses, each with its own gate.
  courseSlug: z.string().min(1),
  seconds: z.number().finite().min(0),
  duration: z.number().finite().positive(),
});

/**
 * Save where the logged-in learner is in a lesson's video, so the next visit
 * resumes there. Overwrites: the latest watch wins, including a rewatch that
 * moves the playhead backwards.
 *
 * Gated like the milestone route, except for the read-only archive view of a
 * completed out-of-tier lesson. The milestone route refuses that view because
 * the gate reads milestones. Nothing reads a playhead to decide access, so
 * resuming an old lesson where you left it moves no live progress.
 */
export async function saveVideoPositionHandler(
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

  const parsed = saveVideoPositionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { lessonSlug, courseSlug, duration } = parsed.data;

  const gate = await evaluateLessonGate({
    userId: session.user.id,
    lessonSlug,
    courseSlug,
  });
  // "No such lesson", "not subscribed" and "locked" all collapse to one 403,
  // so this route cannot be used to enumerate lessons.
  if (!gate || !gate.subscribed || gate.lessonLock.kind !== 'open') {
    return new Response('Forbidden', { status: 403 });
  }
  if (gate.outOfTier && !gate.outOfTier.readOnly) {
    return new Response('Forbidden', { status: 403 });
  }

  const lessonId = await getLessonIdBySlug(lessonSlug);
  if (lessonId === null) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    await saveResumePosition({
      userId: session.user.id,
      lessonId,
      // `currentTime` can overshoot `duration` by a frame at the very end.
      seconds: Math.min(parsed.data.seconds, duration),
      duration,
    });
  } catch (error) {
    console.error('Failed to save video position:', error);
    return Response.json({ error: 'Failed to save position' }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/user/video-position')({
  server: {
    handlers: {
      POST: ({ request }) => saveVideoPositionHandler(request),
    },
  },
});
