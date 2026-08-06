import { createFileRoute } from '@tanstack/react-router';
import {
  listRolePermissions,
  listRoles,
  setRolePermission,
} from '#/db/permissions';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setRolePermissionInputSchema } from '#/lib/admin-schemas';
import { requireOwner } from '#/lib/permissions.server';

function denied(error: unknown): Response | null {
  return error instanceof ForbiddenError
    ? new Response('Forbidden', { status: 403 })
    : null;
}

/** The permission grid, owner-only — this is where delegation is configured. */
export async function getRolePermissionsHandler(
  request: Request,
): Promise<Response> {
  try {
    await requireOwner(request.headers);
  } catch (error) {
    const res = denied(error);
    if (res) return res;
    throw error;
  }

  const [roles, permissions] = await Promise.all([
    listRoles(),
    listRolePermissions(),
  ]);
  return Response.json({ roles, permissions });
}

export async function putRolePermissionHandler(
  request: Request,
): Promise<Response> {
  try {
    await requireOwner(request.headers);
  } catch (error) {
    const res = denied(error);
    if (res) return res;
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = setRolePermissionInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await setRolePermission({
    roleName: parsed.data.role,
    entity: parsed.data.entity,
    action: parsed.data.action,
    granted: parsed.data.granted,
  });

  if (!result.ok) {
    return result.reason === 'owner'
      ? Response.json(
          {
            error:
              'The owner role bypasses permission checks, so it has nothing to configure.',
          },
          { status: 409 },
        )
      : Response.json({ error: 'Role not found' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/role-permissions')({
  server: {
    handlers: {
      GET: ({ request }) => getRolePermissionsHandler(request),
      PUT: ({ request }) => putRolePermissionHandler(request),
    },
  },
});
