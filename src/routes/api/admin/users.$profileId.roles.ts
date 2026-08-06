import { createFileRoute } from '@tanstack/react-router';
import { setUserRole } from '#/db/permissions';
import { getUserProfile } from '#/db/users';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setUserRoleInputSchema } from '#/lib/admin-schemas';
import { requireOwner } from '#/lib/permissions.server';
import { parseProfileId } from './users.$profileId';

/**
 * Assign or revoke a role. **Owner-only, and deliberately not expressible as a
 * grantable permission.**
 *
 * This is the containment boundary of the whole design: if role assignment
 * could be delegated, an admin holding it could promote themselves to owner
 * and the hierarchy would be decorative. `user:update` excludes roles for the
 * same reason.
 */
export async function putUserRoleHandler(
  request: Request,
  profileIdRaw: string,
): Promise<Response> {
  const profileId = parseProfileId(profileIdRaw);
  if (profileId === null) {
    return Response.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let actorUserId: string;
  try {
    ({ userId: actorUserId } = await requireOwner(request.headers));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = setUserRoleInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!(await getUserProfile(profileId))) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  const result = await setUserRole({
    profileId,
    roleName: parsed.data.role,
    granted: parsed.data.granted,
    actorUserId,
  });

  if (!result.ok) {
    if (result.reason === 'last-owner') {
      // 409 rather than 403: the actor is allowed to do this in general, the
      // system state is what forbids it.
      return Response.json(
        {
          error:
            "The last owner can't be removed — make someone else an owner first.",
        },
        { status: 409 },
      );
    }
    return Response.json({ error: 'Role or user not found' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/users/$profileId/roles')({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        putUserRoleHandler(request, params.profileId),
    },
  },
});
