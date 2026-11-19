import { createFileRoute } from '@tanstack/react-router';
import { getViperSession } from '#/db/viper-sessions';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import type { SessionTranscript } from '#/lib/viper-session-schemas';

/** Null for an admin, or the 403 to send instead. */
async function guard(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

/** One learner chat's transcript, read-only. 404 when no such chat exists. */
export async function getSessionHandler(
  request: Request,
  chatId: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const session: SessionTranscript | null = await getViperSession(chatId);
  if (!session) {
    return Response.json({ error: 'Conversation not found' }, { status: 404 });
  }
  return Response.json(session);
}

export const Route = createFileRoute('/api/admin/viper/sessions/$chatId')({
  server: {
    handlers: {
      GET: ({ request, params }) => getSessionHandler(request, params.chatId),
    },
  },
});
