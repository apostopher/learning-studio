import { createFileRoute } from '@tanstack/react-router';
import { publishPersona } from '#/db/persona';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { parsePersonaId } from './personas.$personaId';

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
 * Promote the staged draft to published content — the only path by which
 * anything an admin types reaches a live system prompt.
 *
 * A row with no draft is a no-op rather than an error: the button is disabled
 * in that state, so reaching here means a duplicate submit or a stale tab,
 * neither of which deserves a failure.
 */
export async function postPersonaPublishHandler(
  request: Request,
  personaIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const personaId = parsePersonaId(personaIdRaw);
  if (personaId === null) {
    return Response.json({ error: 'Invalid persona id' }, { status: 400 });
  }

  const published = await publishPersona(getActiveOrgId(), personaId);
  if (!published) {
    return Response.json({ error: 'Persona not found' }, { status: 404 });
  }
  return Response.json(published);
}

export const Route = createFileRoute('/api/admin/personas/$personaId/publish')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        postPersonaPublishHandler(request, params.personaId),
    },
  },
});
