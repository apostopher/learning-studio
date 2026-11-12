import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { DEBRIEF_ANSWER_MAX_CHARS } from '#/lib/answer-metrics';
import { auth } from '#/lib/auth';
import { saveDraft } from '#/lib/debrief-attempt.server';

const DraftInputSchema = z.object({
  attemptId: z.number().int().positive(),
  questionId: z.string().min(1),
  // Empty is a real draft: the pilot cleared the box.
  text: z.string().max(DEBRIEF_ANSWER_MAX_CHARS),
});

/**
 * Autosave the answer being typed (debounced by the client), so a closed tab
 * or dropped connection loses nothing. 204 on success; 403 when the attempt
 * is not the session pilot's own unfinished one; 400 when the question is
 * not the attempt's current (first unanswered) one.
 */
export async function saveDraftHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = DraftInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'attemptId, questionId and text are required' },
      { status: 400 },
    );
  }

  try {
    const outcome = await saveDraft({
      userId: session.user.id,
      ...parsed.data,
    });
    if (outcome === 'wrong-question') {
      return Response.json(
        { error: 'A draft is only kept for the current question' },
        { status: 400 },
      );
    }
    return outcome === 'saved'
      ? new Response(null, { status: 204 })
      : new Response('Forbidden', { status: 403 });
  } catch (error) {
    console.error('Failed to save debrief draft:', error);
    return Response.json({ error: 'Failed to save draft' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/lesson/debrief/draft')({
  server: {
    handlers: { POST: ({ request }) => saveDraftHandler(request) },
  },
});
