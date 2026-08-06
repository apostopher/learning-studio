import { createFileRoute } from '@tanstack/react-router';
import { getUserProfile, updateUserProfile } from '#/db/users';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { updateUserProfileInputSchema } from '#/lib/admin-schemas';
import {
  assertCanActOnProfile,
  requirePermission,
} from '#/lib/permissions.server';

export function parseProfileId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Edit a learner's profile.
 *
 * Guarded twice on purpose: `requirePermission` checks the actor may update
 * users at all, and `assertCanActOnProfile` checks the *target* isn't an admin
 * or owner. Without the second, an admin holding `user:update` could rewrite a
 * privileged account's record — the delegation boundary has to hold on both
 * ends.
 */
export async function patchUserHandler(
  request: Request,
  profileIdRaw: string,
): Promise<Response> {
  const profileId = parseProfileId(profileIdRaw);
  if (profileId === null) {
    return Response.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    const actor = await requirePermission(request.headers, 'user', 'update');
    await assertCanActOnProfile(actor, profileId);
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

  const parsed = updateUserProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!(await getUserProfile(profileId))) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  await updateUserProfile(profileId, parsed.data);
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/users/$profileId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchUserHandler(request, params.profileId),
    },
  },
});
