import { createFileRoute } from '@tanstack/react-router';
import { auth } from '#/lib/auth';
import { setNewsSourceMuted } from '#/lib/news.server';
import { SetNewsSourceMutedInputSchema } from '#/lib/news-schemas';

/**
 * Mute or unmute one news source for the signed-in learner.
 *
 * A row in `user_news_sources` is an EXCLUSION: present means muted, absent
 * means visible. The inclusion model this replaces could not express "show me
 * nothing" — unticking every source left zero rows, which read as "show
 * everything".
 */
export async function postNewsMuteHandler(request: Request): Promise<Response> {
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

  const parsed = SetNewsSourceMutedInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await setNewsSourceMuted({
      userId: session.user.id,
      sourceId: parsed.data.sourceId,
      muted: parsed.data.muted,
    });
    if (!result.ok) {
      // Deliberately one status for "no such source" and "not your course":
      // distinguishing them would let a learner enumerate other courses'
      // source ids.
      return Response.json({ error: 'News source not found' }, { status: 404 });
    }
    return Response.json({ sourceId: result.sourceId, muted: result.muted });
  } catch (error) {
    console.error('Failed to set news source mute state:', error);
    return Response.json(
      { error: 'Failed to update preference' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/course/news/mute')({
  server: {
    handlers: {
      POST: ({ request }) => postNewsMuteHandler(request),
    },
  },
});
