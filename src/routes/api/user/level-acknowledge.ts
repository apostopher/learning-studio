import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { acknowledgeLevelRow } from '#/db/user-levels';
import { auth } from '#/lib/auth';

const bodySchema = z.object({ rowId: z.number().int().positive() });

/**
 * Dismiss an admin-issued level-change notice for the logged-in pilot.
 *
 * `acknowledgeLevelRow` is scoped by `userId` inside its own WHERE clause, so
 * one pilot cannot dismiss another's row even with a guessed `rowId` — but the
 * `userId` it receives still comes from the session, never the request body,
 * matching every other write under `/api/user/*`.
 */
export async function postLevelAcknowledgeHandler(
  request: Request,
): Promise<Response> {
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await acknowledgeLevelRow(session.user.id, parsed.data.rowId);
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/user/level-acknowledge')({
  server: {
    handlers: { POST: ({ request }) => postLevelAcknowledgeHandler(request) },
  },
});
