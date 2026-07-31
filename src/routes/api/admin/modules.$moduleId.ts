import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test. Same reason the onboarding route uses it.
import {
  deleteModule,
  reorderModule,
  updateModule,
  updateModuleDependencies,
} from '#/db/admin';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import {
  reorderModuleInputSchema,
  updateModuleDependenciesInputSchema,
  updateModuleInputSchema,
} from '#/lib/admin-schemas';

/** Admin guard — returns a 403 Response to short-circuit, or null to proceed. */
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

function parseModuleId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function patchModuleHandler(
  request: Request,
  moduleIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const moduleId = parseModuleId(moduleIdRaw);
  if (moduleId === null) {
    return Response.json({ error: 'Invalid module id' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Checked before the others: this body carries only `dependsOn`, and
  // updateModuleInputSchema is non-strict, so a future optional field there
  // could otherwise swallow a dependency write and silently drop it.
  const dependencies = updateModuleDependenciesInputSchema.safeParse(body);
  if (dependencies.success) {
    const result = await updateModuleDependencies(
      moduleId,
      dependencies.data.dependsOn,
    );
    if (result.ok) return Response.json(result);
    if (result.reason === 'not-found') {
      return new Response('Not found', { status: 404 });
    }
    if (result.reason === 'cycle') {
      // 409, not 400: the request was well-formed and was legal against the
      // board the client held. It lost a race, so the client's fix is to
      // refetch rather than to correct the body.
      return Response.json(
        { error: 'cycle', slugs: result.slugs },
        { status: 409 },
      );
    }
    return Response.json(
      { error: 'unknown-modules', slugs: result.slugs },
      { status: 400 },
    );
  }

  const update = updateModuleInputSchema.safeParse(body);
  if (update.success) {
    const updated = await updateModule(moduleId, update.data);
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }

  const reorder = reorderModuleInputSchema.safeParse(body);
  if (reorder.success) {
    const updated = await reorderModule({
      moduleId,
      prevModuleId: reorder.data.prevModuleId,
      nextModuleId: reorder.data.nextModuleId,
    });
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }

  return Response.json({ error: 'Invalid body' }, { status: 400 });
}

export async function deleteModuleHandler(
  request: Request,
  moduleIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const moduleId = parseModuleId(moduleIdRaw);
  if (moduleId === null) {
    return Response.json({ error: 'Invalid module id' }, { status: 400 });
  }
  const deleted = await deleteModule(moduleId);
  if (!deleted) return new Response('Not found', { status: 404 });
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/modules/$moduleId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchModuleHandler(request, params.moduleId),
      DELETE: ({ request, params }) =>
        deleteModuleHandler(request, params.moduleId),
    },
  },
});
