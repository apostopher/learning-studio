import { createFileRoute } from '@tanstack/react-router';
import { insertLevelRow, listLevelHistory } from '#/db/user-levels';
import { getUserProfile } from '#/db/users';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setUserLevelInputSchema } from '#/lib/admin-schemas';
import {
  assertCanActOnProfile,
  requirePermission,
} from '#/lib/permissions.server';

export function parseProfileId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET a pilot's level history in one course. */
export async function getUserLevelsHandler(
  request: Request,
  profileIdRaw: string,
): Promise<Response> {
  const profileId = parseProfileId(profileIdRaw);
  if (profileId === null) {
    return Response.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    await requirePermission(request.headers, 'level', 'read');
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  const profile = await getUserProfile(profileId);
  if (!profile) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const courseIdRaw = url.searchParams.get('courseId');
  const courseId = courseIdRaw === null ? Number.NaN : Number(courseIdRaw);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return Response.json(
      { error: 'A valid courseId is required' },
      { status: 400 },
    );
  }

  const history = await listLevelHistory(profile.userId, courseId);
  return Response.json({ history });
}

/**
 * Correct a pilot's level.
 *
 * Guarded twice on purpose, same as `patchUserHandler`: `requirePermission`
 * checks the actor may set levels at all, and `assertCanActOnProfile` checks
 * the *target* isn't an admin or owner.
 *
 * Deliberately unconstrained beyond that: any level, any direction, any jump.
 * The automatic promotion path only ever writes upward, so this route is the
 * only way to correct a wrong level — including walking one back — and
 * blocking a "backwards" or "skipping" change here would remove the only
 * correction path there is. The append-only table means a demotion destroys
 * nothing: it is just a newer row, and undo is a single insert.
 */
export async function putUserLevelHandler(
  request: Request,
  profileIdRaw: string,
): Promise<Response> {
  const profileId = parseProfileId(profileIdRaw);
  if (profileId === null) {
    return Response.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission(request.headers, 'level', 'update');
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

  const parsed = setUserLevelInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const profile = await getUserProfile(profileId);
  if (!profile) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  // `changedBy` is the acting admin from the guard's returned actor — never a
  // client-supplied value, so the audit trail can't be spoofed by the caller.
  await insertLevelRow({
    userId: profile.userId,
    courseId: parsed.data.courseId,
    level: parsed.data.level,
    source: 'admin',
    message: parsed.data.message,
    note: parsed.data.note,
    changedBy: actor.userId,
  });

  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/users/$profileId/levels')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getUserLevelsHandler(request, params.profileId),
      PUT: ({ request, params }) =>
        putUserLevelHandler(request, params.profileId),
    },
  },
});
