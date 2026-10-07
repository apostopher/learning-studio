import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getCourseDetailsWithCache } from '#/db/course';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';
import { prepareDebrief } from '#/lib/prepared-debrief.server';

const PrepareInputSchema = z.object({
  lessonSlug: z.string().min(1),
  courseSlug: z.string().min(1),
});

/**
 * Start generating this pilot's debrief while they watch the video, so it is
 * ready when the video unlocks it. See `prepareDebrief`.
 *
 * Fired by the player on first play, fire-and-forget, so every outcome —
 * including "not eligible" — is a body-less 204: the client never reads it,
 * and nothing about the lesson is disclosed. Only a broken request or session
 * gets a 4xx.
 *
 * Eligibility is narrower than `generate`'s, on purpose. Preparation only runs
 * while the material is still `video-locked`: that is the one window where it
 * saves the pilot a wait. Once the video is watched, Start generates on demand
 * as before — and a rewatch of a finished lesson does not quietly spend a
 * model run on a debrief nobody asked for.
 */
export async function prepareTestHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PrepareInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'lessonSlug and courseSlug are required' },
      { status: 400 },
    );
  }
  const { lessonSlug, courseSlug } = parsed.data;
  const skipped = new Response(null, { status: 204 });

  try {
    const gate = await evaluateLessonGate({
      userId: session.user.id,
      lessonSlug,
      courseSlug,
    });
    // The same refusals as `generate` — unsubscribed, prerequisite-locked,
    // out-of-tier — except that `video-locked` material is the point.
    if (
      !gate ||
      !gate.subscribed ||
      gate.lessonLock.kind !== 'open' ||
      gate.outOfTier ||
      gate.materialLock.kind !== 'video-locked'
    ) {
      return skipped;
    }

    // `lessons.has_debrief` off means tab 2 is the authored quiz, and no
    // debrief will ever be asked for. Already cached: the gate just read it.
    const details = await getCourseDetailsWithCache(courseSlug);
    const lesson = details?.modules
      .flatMap((mod) => mod.lessons)
      .find((l) => l.slug === lessonSlug);
    if (!lesson?.hasDebrief) return skipped;

    await prepareDebrief({
      userId: session.user.id,
      courseId: gate.courseId,
      lessonSlug,
    });
    return skipped;
  } catch (error) {
    // Nothing is lost: Start still generates on demand.
    console.error('Failed to prepare debrief:', error);
    return skipped;
  }
}

export const Route = createFileRoute('/api/lesson/ai-test/prepare')({
  server: {
    handlers: { POST: ({ request }) => prepareTestHandler(request) },
  },
});
