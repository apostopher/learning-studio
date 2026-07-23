import { createFileRoute } from '@tanstack/react-router';
import { listChats } from '#/db/chat';
import { auth } from '#/lib/auth';

/**
 * List the authed user's chats, most recently updated first — powers the
 * chat sidebar. Ownership scoping happens inside `listChats` itself.
 */
export async function listChatsHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  return Response.json(await listChats(session.user.id));
}

export const Route = createFileRoute('/api/chats')({
  server: {
    handlers: {
      GET: ({ request }) => listChatsHandler(request),
    },
  },
});
