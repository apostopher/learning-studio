import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { generateTest } from '#/ai/generate-test';
import { auth } from '#/lib/auth';
import { getDebriefAccess } from '#/lib/debrief-access.server';
import { debriefNotOpen } from '#/lib/debrief-not-open';
import { resolveDebriefSource } from '#/lib/lesson-debrief-source.server';
import {
  discardPreparedDebrief,
  sourceFingerprint,
  takePreparedDebrief,
} from '#/lib/prepared-debrief.server';

/**
 * `lessonSlug` and the course it is being read in. The body used to carry
 * `keyPoints` and `text` as well, which made the caller responsible for
 * supplying the prompt's source material — so a lesson with no material row
 * could not start a debrief at all, and any signed-in caller could have
 * questions generated from text of their choosing. See `resolveDebriefSource`.
 *
 * `courseSlug` because a lesson can be placed in several courses, each with
 * its own gate and credentials, so it cannot be inferred from the slug.
 */
const GenerateInputSchema = z.object({
  lessonSlug: z.string().min(1),
  courseSlug: z.string().min(1),
});

export async function generateTestHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = GenerateInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'lessonSlug and courseSlug are required' },
      { status: 400 },
    );
  }
  const { lessonSlug, courseSlug } = parsed.data;

  try {
    // The single authority on whether this pilot may take this debrief now:
    // subscription, prerequisites, level (out-of-tier refused in BOTH
    // read-only states — generating is new assessment work) and has_debrief,
    // then the 24h schedule. All before the source lookup and the model, so a
    // refusal costs no tokens.
    const access = await getDebriefAccess({
      userId: session.user.id,
      lessonSlug,
      courseSlug,
      now: new Date(),
    });
    if (!access.ok) {
      return new Response(access.status === 404 ? 'Not Found' : 'Forbidden', {
        status: access.status,
      });
    }
    // Not done yet, inside the 24h wait, waiting to retake, or already passed.
    // The client hiding the button is not the gate; this is.
    if (access.state.kind !== 'open') {
      return debriefNotOpen(access.state);
    }

    const key = {
      userId: session.user.id,
      courseId: access.courseId,
      lessonSlug,
    };
    const source = await resolveDebriefSource(lessonSlug, access.courseId);
    if (!source) {
      // Not a 500: nothing is broken. This lesson has neither authored
      // material nor a usable transcript, so there is nothing to build a
      // debrief from — and the UI does not offer one. Any prepared row goes
      // too (ledger T8): it would keep the lesson debrief-bearing in the
      // course SQL for a debrief that can no longer be generated.
      await discardPreparedDebrief(key);
      return Response.json(
        { error: 'This lesson has no debrief source' },
        { status: 422 },
      );
    }

    // Prepared ahead (see `prepare.ts`), served only if it was built from the
    // source as it is NOW — material or captions edited since are a miss.
    const prepared = await takePreparedDebrief(
      key,
      sourceFingerprint(source.text),
    );
    if (prepared) return Response.json(prepared);

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
