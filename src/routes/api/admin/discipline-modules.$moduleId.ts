import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: see the sibling routes.
import {
  deleteDisciplineModule,
  getDisciplineIdForDisciplineModule,
  renameDisciplineModule,
  reorderDisciplineModule,
} from '#/db/discipline-modules';
import { findDisciplineInOrg } from '#/db/disciplines';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  renameDisciplineModuleInputSchema,
  reorderDisciplineModuleInputSchema,
} from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The module's DISCIPLINE is resolved first and everything — ownership,
 * guard — hangs off it. A body cannot name a discipline; the module says
 * whose it is.
 */
async function admit(
  request: Request,
  moduleId: number,
  action: 'update' | 'delete',
): Promise<Response | null> {
  const disciplineId = await getDisciplineIdForDisciplineModule(moduleId);
  if (disciplineId === null)
    return absentResourceResponse(request.headers, 'Module not found');
  if (!(await findDisciplineInOrg(getActiveOrgId(), disciplineId))) {
    return absentResourceResponse(request.headers, 'Module not found');
  }
  try {
    await requireLessonContentPermission(request.headers, disciplineId, action);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError)
      return new Response('Forbidden', { status: 403 });
    throw error;
  }
}

export async function patchDisciplineModuleHandler(
  request: Request,
  moduleIdRaw: string,
): Promise<Response> {
  const moduleId = parseId(moduleIdRaw);
  if (moduleId === null)
    return Response.json({ error: 'Invalid module id' }, { status: 400 });
  const denied = await admit(request, moduleId, 'update');
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const reorder = reorderDisciplineModuleInputSchema.safeParse(body);
  if (reorder.success) {
    const updated = await reorderDisciplineModule({
      moduleId,
      ...reorder.data,
    });
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }
  const rename = renameDisciplineModuleInputSchema.safeParse(body);
  if (rename.success) {
    const updated = await renameDisciplineModule(moduleId, rename.data.name);
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }
  return Response.json({ error: 'Invalid body' }, { status: 400 });
}

/** Deletes the module ROW; its lessons return to Untitled (FK `set null`). */
export async function deleteDisciplineModuleHandler(
  request: Request,
  moduleIdRaw: string,
): Promise<Response> {
  const moduleId = parseId(moduleIdRaw);
  if (moduleId === null)
    return Response.json({ error: 'Invalid module id' }, { status: 400 });
  const denied = await admit(request, moduleId, 'delete');
  if (denied) return denied;
  const result = await deleteDisciplineModule(moduleId);
  if (!result.ok) return new Response('Not found', { status: 404 });
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/discipline-modules/$moduleId')(
  {
    server: {
      handlers: {
        PATCH: ({ request, params }) =>
          patchDisciplineModuleHandler(request, params.moduleId),
        DELETE: ({ request, params }) =>
          deleteDisciplineModuleHandler(request, params.moduleId),
      },
    },
  },
);
