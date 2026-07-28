import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '#/lib/auth';
import { advanceOnboarding } from '#/lib/onboarding-session.server';

/**
 * Fields both intents carry. `expectedUpdatedAt` is optional and nullable: a
 * client that has not read a turn yet has nothing to compare, and JSON
 * round-trips an absent value as either missing or null. The concurrency guard
 * therefore works identically on a reply and on a confirmation.
 */
const replyBaseFields = {
  courseSlug: z.string().min(1),
  expectedUpdatedAt: z.string().min(1).nullish(),
};

/**
 * Zod strips unknown keys, which is load-bearing here rather than incidental:
 * a `userId` smuggled into the body never survives parsing, and the handler
 * only ever reads the id from the session. See the SECURITY note below.
 *
 * `text`'s 5000-char cap matches `OnboardingAnswersSchema`'s per-answer cap —
 * the transport must not accept what storage would reject, or a long reply
 * would be evaluated and then fail to persist.
 *
 * The `type` discriminator is what makes the interview finishable. The
 * machine's `confirming` state advances to `completing` on CONFIRM and treats
 * a REPLY as a correction that loops back through `summarising`, so a route
 * that only ever sent REPLY could never complete an interview: the trainee
 * could correct the closing summary forever but never accept it, and
 * `onboardingCompletedAt` would never be stamped.
 *
 * It is an explicit discriminator rather than a sentinel in `text` (e.g.
 * treating the literal "confirm" as an accept) on purpose: the server must
 * never infer control flow from message content — the same rule
 * `OnboardingTurnResponse` states in the other direction for the client.
 */
const ReplyBodySchema = z.discriminatedUnion('type', [
  z.object({
    ...replyBaseFields,
    type: z.literal('reply'),
    text: z.string().min(1).max(5000),
  }),
  z.object({ ...replyBaseFields, type: z.literal('confirm') }),
]);

/**
 * Feeds one reply — or the trainee's acceptance of the closing summary — into
 * the interview and answers with the settled turn.
 *
 * SECURITY: `userId` comes from `auth.api.getSession` and nowhere else — not
 * the body, not the query string, not a header. `advanceOnboarding` takes it
 * as an argument precisely so this is the only place a session is read.
 *
 * 409 is not a generic failure: it means this session already moved on (a
 * second tab, or a double-submit), and the client should re-read rather than
 * retry. Without it the two turns would last-write-wins and one would vanish
 * with no error anywhere.
 */
export async function replyOnboardingHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ReplyBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await advanceOnboarding({
      userId: session.user.id,
      courseSlug: parsed.data.courseSlug,
      // 'confirm' accepts the closing summary (CONFIRM → completing →
      // complete); anything else is a reply, which `confirming` treats as a
      // correction. Mapped from the discriminator, never sniffed from `text`.
      event:
        parsed.data.type === 'confirm'
          ? { type: 'CONFIRM' }
          : { type: 'REPLY', text: parsed.data.text },
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    });

    if (!result.ok) {
      return result.reason === 'course_not_found'
        ? Response.json({ error: 'Course not found' }, { status: 404 })
        : Response.json(
            { error: 'Onboarding session changed' },
            { status: 409 },
          );
    }

    return Response.json(result.body);
  } catch (error) {
    console.error('Failed to advance onboarding:', error);
    return Response.json({ error: 'Failed to send reply' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/course/onboarding/reply')({
  server: {
    handlers: {
      POST: ({ request }) => replyOnboardingHandler(request),
    },
  },
});
