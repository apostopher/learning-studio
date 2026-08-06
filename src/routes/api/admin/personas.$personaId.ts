import { createFileRoute } from '@tanstack/react-router';
import { deletePersona, renamePersona } from '#/db/persona';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { renamePersonaInputSchema } from '#/lib/admin-schemas';

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

export function parsePersonaId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Rename only. Content never comes through here — it goes to the draft route
 * and reaches `content` solely via an explicit publish.
 */
export async function patchPersonaHandler(
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

  const parsed = renamePersonaInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await renamePersona(
    getActiveOrgId(),
    personaId,
    parsed.data.name,
  );
  if (!result.ok) {
    return result.reason === 'duplicate-name'
      ? Response.json(
          {
            error: 'This org already has a persona with this name',
            field: 'name',
          },
          { status: 409 },
        )
      : Response.json({ error: 'Persona not found' }, { status: 404 });
  }
  return Response.json(result.persona);
}

/**
 * Delete. `course_orgs.personaId` is `set null` and the org-default flag lives
 * on this row, so affected courses fall back down the resolution chain. The
 * UI names them in the confirm dialog before this is ever called.
 */
export async function deletePersonaHandler(
  request: Request,
  personaIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const personaId = parsePersonaId(personaIdRaw);
  if (personaId === null) {
    return Response.json({ error: 'Invalid persona id' }, { status: 400 });
  }

  const deleted = await deletePersona(getActiveOrgId(), personaId);
  if (!deleted) {
    return Response.json({ error: 'Persona not found' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/personas/$personaId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchPersonaHandler(request, params.personaId),
      DELETE: ({ request, params }) =>
        deletePersonaHandler(request, params.personaId),
    },
  },
});
