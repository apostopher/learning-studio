import { createFileRoute } from '@tanstack/react-router';
import { getChat } from '#/db/chat';
import { auth } from '#/lib/auth';

/**
 * Load a single chat (with its messages) to resume a conversation.
 * `getChat` is ownership-checked — it returns null both when the chat
 * doesn't exist and when it belongs to another user, so this never leaks
 * whether a given chatId exists to a non-owner.
 */
export async function getChatHandler(
  request: Request,
  chatId: string,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const chat = await getChat(session.user.id, chatId);
  if (!chat) {
    return new Response('Not found', { status: 404 });
  }

  return Response.json(chat);
}

export const Route = createFileRoute('/api/chats/$chatId')({
  server: {
    handlers: {
      GET: ({ request, params }) => getChatHandler(request, params.chatId),
    },
  },
});
