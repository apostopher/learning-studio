import { createFileRoute } from '@tanstack/react-router';
import {
  addUserEnrolment,
  getUserProfile,
  removeUserEnrolment,
} from '#/db/users';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setEnrolmentInputSchema } from '#/lib/admin-schemas';
import {
  assertCanActOnProfile,
  requirePermission,
} from '#/lib/permissions.server';
import { parseProfileId } from './users.$profileId';

/**
 * Grant or revoke a course for an existing account — the primary delegated
 * task, which is why `enrolment` is its own entity: it can be granted without
 * `user:update`, and never implies it.
 *
 * Revoking removes the entitlement row only. Progress, onboarding answers and
 * the SKA profile survive, so re-granting resumes where the learner left off.
 */
export async function putEnrolmentHandler(
  request: Request,
  profileIdRaw: string,
): Promise<Response> {
  const profileId = parseProfileId(profileIdRaw);
  if (profileId === null) {
    return Response.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = setEnrolmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const actor = await requirePermission(
      request.headers,
      'enrolment',
      parsed.data.granted ? 'create' : 'delete',
    );
    await assertCanActOnProfile(actor, profileId);

    const profile = await getUserProfile(profileId);
    if (!profile) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    if (parsed.data.granted) {
      await addUserEnrolment({
        userId: profile.userId,
        courseId: parsed.data.courseId,
        grantedBy: actor.userId,
      });
    } else {
      await removeUserEnrolment(profile.userId, parsed.data.courseId);
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

export const Route = createFileRoute('/api/admin/users/$profileId/enrolments')({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        putEnrolmentHandler(request, params.profileId),
    },
  },
});
