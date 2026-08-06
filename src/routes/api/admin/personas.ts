import { createFileRoute } from '@tanstack/react-router';
import { createPersona, listPersonas, listPersonaUsage } from '#/db/persona';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { createPersonaInputSchema } from '#/lib/admin-schemas';

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
 * Every persona in the active org, each with the courses currently using it —
 * so the delete confirm can state the consequence without another request.
 */
export async function getPersonasHandler(request: Request): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const orgId = getActiveOrgId();
  const [personas, usage] = await Promise.all([
    listPersonas(orgId),
    listPersonaUsage(orgId),
  ]);

  return Response.json(
    personas.map((persona) => ({
      ...persona,
      usedByCourses: usage[persona.id] ?? [],
    })),
  );
}

export async function postPersonaHandler(request: Request): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createPersonaInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createPersona(getActiveOrgId(), parsed.data.name);
  if (!result.ok) {
    // 409 + the field name so the inline name input can own the message
    // rather than a toast leaving the offending field unmarked.
    return Response.json(
      { error: 'This org already has a persona with this name', field: 'name' },
      { status: 409 },
    );
  }
  return Response.json(
    { ...result.persona, usedByCourses: [] },
    { status: 201 },
  );
}

export const Route = createFileRoute('/api/admin/personas')({
  server: {
    handlers: {
      GET: ({ request }) => getPersonasHandler(request),
      POST: ({ request }) => postPersonaHandler(request),
    },
  },
});
