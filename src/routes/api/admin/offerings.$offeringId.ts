import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { deleteOffering, updateOffering } from '#/db/offerings';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { updateOfferingInputSchema } from '#/lib/offering-schemas';
import { requireCourseCreation } from '#/lib/permissions.server';
import { actingUserId } from './offerings';

/**
 * One offering: change its dates and roster, or unschedule it.
 *
 * Same write authority as creating one (`requireCourseCreation` — the
 * course-manager-or-admin union of RBAC rule 5), because moving a run and
 * scheduling one are the same decision made at different times. Guarded here
 * rather than inherited from the collection route: these are separate
 * modules, and a guard that lives somewhere else is a guard that can be
 * removed without this file changing.
 */
async function guard(request: Request): Promise<Response | null> {
  try {
    await requireCourseCreation(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

function parseOfferingId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function patchOfferingHandler(
  request: Request,
  offeringIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const offeringId = parseOfferingId(offeringIdRaw);
  if (offeringId === null) {
    return Response.json({ error: 'Invalid offering id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = updateOfferingInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const actorId = await actingUserId(request.headers);
  const updated = await updateOffering(offeringId, parsed.data, actorId);
  if (!updated) {
    return Response.json({ error: 'Offering not found' }, { status: 404 });
  }
  return Response.json(updated);
}

export async function deleteOfferingHandler(
  request: Request,
  offeringIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const offeringId = parseOfferingId(offeringIdRaw);
  if (offeringId === null) {
    return Response.json({ error: 'Invalid offering id' }, { status: 400 });
  }

  const removed = await deleteOffering(offeringId);
  if (!removed) {
    return Response.json({ error: 'Offering not found' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/offerings/$offeringId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchOfferingHandler(request, params.offeringId),
      DELETE: ({ request, params }) =>
        deleteOfferingHandler(request, params.offeringId),
    },
  },
});
