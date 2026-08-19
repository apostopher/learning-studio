import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getLessonIdBySlug } from '#/db/lesson-access';
import { recordLessonProgress } from '#/db/videos-progress';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

const reportVideoProgressSchema = z.object({
  lessonSlug: z.string().min(1),
  progress: z.number().int().min(0).max(100),
});

/**
 * Record a video-progress milestone for the logged-in user (append-only).
 * Any authenticated user may report their own progress — no admin role needed
 * — but only for a lesson they are actually authorized to watch.
 *
 * The gate check is not optional: without it, any signed-in caller could
 * self-report full coverage for an arbitrary lessonSlug and unlock every
 * gated lesson in the platform, since gating reads progress rows to decide
 * what's watched. "No such lesson", "not subscribed", and "locked" all
 * collapse to the same 403 — distinguishing them hands an enumeration oracle
 * to any signed-in caller, the same rule the playback route follows.
 */
export async function reportVideoProgressHandler(
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

  const parsed = reportVideoProgressSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const gate = await evaluateLessonGate({
    userId: session.user.id,
    lessonSlug: parsed.data.lessonSlug,
  });
  if (!gate || !gate.subscribed || gate.lessonLock.kind !== 'open') {
    return new Response('Forbidden', { status: 403 });
  }
  // Outside the pilot's level — refused in BOTH out-of-tier cases, read-only
  // included. This is the write the archive view must never perform: video
  // progress rows are what the gate reads to decide what has been watched, so
  // recording them against a lesson from another tier would let a read-only
  // view move the pilot's live progress. The client stops reporting in
  // read-only mode; this is the half that does not depend on the client.
  if (gate.outOfTier) {
    return new Response('Forbidden', { status: 403 });
  }

  const lessonId = await getLessonIdBySlug(parsed.data.lessonSlug);
  if (lessonId === null) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    await recordLessonProgress({
      userId: session.user.id,
      lessonId,
      progress: parsed.data.progress,
    });
  } catch (error) {
    console.error('Failed to record video progress:', error);
    return Response.json({ error: 'Failed to save progress' }, { status: 500 });
  }

  return Response.json({ message: 'Video progress saved' }, { status: 201 });
}

export const Route = createFileRoute('/api/user/report-video-progress')({
  server: {
    handlers: {
      POST: ({ request }) => reportVideoProgressHandler(request),
    },
  },
});
