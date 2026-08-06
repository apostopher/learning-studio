import { createFileRoute } from '@tanstack/react-router';
import { discardPersonaDraft, savePersonaDraft } from '#/db/persona';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { personaContentInputSchema } from '#/lib/admin-schemas';
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
 * Autosave target for the persona editor. Writes `draftContent` only — never
 * `content` — so nothing typed here can reach a live system prompt before an
 * explicit publish.
 *
 * **POST, not PATCH, on purpose.** `navigator.sendBeacon` can only issue a
 * POST and cannot set request headers, so the tab-close flush would be
 * impossible against a PATCH route. The body arrives as an
 * `application/json` Blob, which parses identically to a normal fetch body;
 * same-origin cookies ride along, so `requireAdmin` works on both paths.
 *
 * Beacon responses are unreadable by design, so the debounced `fetch` caller
 * is the one that surfaces failures — this handler just has to be honest
 * about its status codes for that path's benefit.
 */
export async function postPersonaDraftHandler(
  request: Request,
  personaIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const personaId = parsePersonaId(personaIdRaw);
  if (personaId === null) {
    return Response.json({ error: 'Invalid persona id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = personaContentInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const saved = await savePersonaDraft(
    getActiveOrgId(),
    personaId,
    parsed.data,
  );
  if (!saved) {
    return Response.json({ error: 'Persona not found' }, { status: 404 });
  }
  return Response.json(saved);
}

/** Discard staged edits and revert to whatever is published. */
export async function deletePersonaDraftHandler(
  request: Request,
  personaIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const personaId = parsePersonaId(personaIdRaw);
  if (personaId === null) {
    return Response.json({ error: 'Invalid persona id' }, { status: 400 });
  }

  const reverted = await discardPersonaDraft(getActiveOrgId(), personaId);
  if (!reverted) {
    return Response.json({ error: 'Persona not found' }, { status: 404 });
  }
  return Response.json(reverted);
}

export const Route = createFileRoute('/api/admin/personas/$personaId/draft')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        postPersonaDraftHandler(request, params.personaId),
      DELETE: ({ request, params }) =>
        deletePersonaDraftHandler(request, params.personaId),
    },
  },
});
