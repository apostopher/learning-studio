import { createFileRoute } from '@tanstack/react-router';
import { listViperSessions } from '#/db/viper-sessions';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import {
  type SessionsPage,
  sessionsPageParamSchema,
} from '#/lib/viper-session-schemas';

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

/**
 * Learners' Viper chats, newest activity first, `SESSIONS_PAGE_SIZE` per
 * page. Admin-only and read-only: these are private conversations, and there
 * is deliberately no delete or export beside this.
 */
export async function listSessionsHandler(request: Request): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const parsed = sessionsPageParamSchema.safeParse(
    new URL(request.url).searchParams.get('page'),
  );
  if (!parsed.success) {
    return Response.json(
      { error: 'page must be a non-negative integer' },
      { status: 400 },
    );
  }

  const body: SessionsPage = await listViperSessions(parsed.data);
  return Response.json(body);
}

export const Route = createFileRoute('/api/admin/viper/sessions')({
  server: {
    handlers: {
      GET: ({ request }) => listSessionsHandler(request),
    },
  },
});
