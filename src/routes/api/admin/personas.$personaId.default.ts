import { createFileRoute } from '@tanstack/react-router';
import { setOrgDefaultPersona } from '#/db/persona';
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
 * Make this persona the org's fallback — used by any chat with no
 * course-level override, including chats with no course in context at all.
 *
 * Rejects an unpublished persona: its `content` is still empty, so it would
 * resolve to the prompt's built-in defaults and look like a broken setting.
 * The UI disables the control for the same reason and says why.
 */
export async function putPersonaDefaultHandler(
  request: Request,
  personaIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const personaId = parsePersonaId(personaIdRaw);
  if (personaId === null) {
    return Response.json({ error: 'Invalid persona id' }, { status: 400 });
  }

  const result = await setOrgDefaultPersona(getActiveOrgId(), personaId);
  if (!result.ok) {
    return result.reason === 'unpublished'
      ? Response.json(
          { error: 'Publish this persona before making it the org default' },
          { status: 409 },
        )
      : Response.json({ error: 'Persona not found' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

/** Clear the org default, leaving the prompt's built-in defaults in charge. */
export async function deletePersonaDefaultHandler(
  request: Request,
  personaIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  if (parsePersonaId(personaIdRaw) === null) {
    return Response.json({ error: 'Invalid persona id' }, { status: 400 });
  }

  await setOrgDefaultPersona(getActiveOrgId(), null);
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/personas/$personaId/default')({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        putPersonaDefaultHandler(request, params.personaId),
      DELETE: ({ request, params }) =>
        deletePersonaDefaultHandler(request, params.personaId),
    },
  },
});
