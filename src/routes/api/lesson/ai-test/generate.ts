import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { generateTest } from '#/ai/generate-test';
import { auth } from '#/lib/auth';
import { resolveDebriefSource } from '#/lib/lesson-debrief-source.server';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

/**
 * `lessonSlug` alone. The body used to carry `keyPoints` and `text` as well,
 * which made the caller responsible for supplying the prompt's source material —
 * so a lesson with no material row could not start a debrief at all, and any
 * signed-in caller could have questions generated from text of their choosing.
 * See `resolveDebriefSource`.
 */
const GenerateInputSchema = z.object({ lessonSlug: z.string().min(1) });

export async function generateTestHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = GenerateInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'lessonSlug is required' }, { status: 400 });
  }
  const { lessonSlug } = parsed.data;

  try {
    // The same gate the material panel passes. The debrief is lesson content,
    // and it now reads that content server-side, so it cannot be looser than
    // the endpoint that serves the material itself. One opaque 403, as in
    // playback.ts, so this is not an enumeration oracle for lesson slugs.
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
    // Outside the pilot's level — refused in BOTH out-of-tier cases, read-only
    // included. Generating a debrief is new assessment work, and an archive
    // view must not start fresh work for a tier the pilot has moved past.
    // Placed before the source lookup and the model call, so a refusal costs
    // no tokens. Opaque 403 for the anti-enumeration reason above.
    if (gate.outOfTier) {
      return new Response('Forbidden', { status: 403 });
    }

    const source = await resolveDebriefSource(lessonSlug);
    if (!source) {
      // Not a 500: nothing is broken. This lesson has neither authored
      // material nor a usable transcript, so there is nothing to build a
      // debrief from — and the UI does not offer one.
      return Response.json(
        { error: 'This lesson has no debrief source' },
        { status: 422 },
      );
    }

    const test = await generateTest(lessonSlug, source.keyPoints, source.text);
    return Response.json(test);
  } catch (error) {
    console.error('Failed to generate test:', error);
    return Response.json({ error: 'Failed to generate test' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/lesson/ai-test/generate')({
  server: {
    handlers: { POST: ({ request }) => generateTestHandler(request) },
  },
});
