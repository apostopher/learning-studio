import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import { getDebriefAccess } from '#/lib/debrief-access.server';
import { prepareDebrief } from '#/lib/prepared-debrief.server';

const PrepareInputSchema = z.object({
  lessonSlug: z.string().min(1),
  courseSlug: z.string().min(1),
});

/**
 * Start generating this pilot's debrief ahead of time, so it is ready the
 * moment it opens. See `prepareDebrief`.
 *
 * Fired by the player on first play, fire-and-forget, so every outcome —
 * including "not eligible" — is a body-less 204: the client never reads it,
 * and nothing about the lesson is disclosed. Only a broken request or session
 * gets a 4xx.
 *
 * Eligible in every state where a debrief will still be asked for: not done
 * yet (the video is playing), waiting, open, and waiting to retake. Not once
 * it is passed — nobody will ask for another — and not where
 * `getDebriefAccess` refuses (out-of-tier, locked, unsubscribed, no debrief).
 * A stored test built from the current source makes a repeat call a no-op.
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
    const access = await getDebriefAccess({
      userId: session.user.id,
      lessonSlug,
      courseSlug,
      now: new Date(),
    });
    if (!access.ok || access.state.kind === 'passed') return skipped;

    await prepareDebrief({
      userId: session.user.id,
      courseId: access.courseId,
      lessonSlug,
    });
    return skipped;
  } catch (error) {
    // Nothing is lost: an open debrief still generates on demand.
    console.error('Failed to prepare debrief:', error);
    return skipped;
  }
}

export const Route = createFileRoute('/api/lesson/ai-test/prepare')({
  server: {
    handlers: { POST: ({ request }) => prepareTestHandler(request) },
  },
});
