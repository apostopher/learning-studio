import { createFileRoute } from '@tanstack/react-router';
import {
  addPendingEnrolment,
  listUnclaimedEnrolments,
} from '#/db/pending-enrolments';
import { listUsers } from '#/db/users';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { addPendingEnrolmentInputSchema } from '#/lib/admin-schemas';
import { requirePermission } from '#/lib/permissions.server';

function denied(error: unknown): Response | null {
  if (error instanceof ForbiddenError) {
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}

/** Accounts plus never-signed-in invitees, so one list answers "who has access". */
export async function getUsersHandler(request: Request): Promise<Response> {
  try {
    await requirePermission(request.headers, 'user', 'read');
  } catch (error) {
    const res = denied(error);
    if (res) return res;
    throw error;
  }

  const [users, pending] = await Promise.all([
    listUsers(),
    listUnclaimedEnrolments(),
  ]);
  return Response.json({ users, pending });
}

/**
 * "Create a user" = record an email with its courses. No account is made and
 * no mail is sent: auth is email-OTP, so the account materialises when they
 * first sign in, and the sign-in hook applies these enrolments then.
 */
export async function postUserHandler(request: Request): Promise<Response> {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission(request.headers, 'user', 'create');
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

  const parsed = addPendingEnrolmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  for (const courseId of parsed.data.courseIds) {
    await addPendingEnrolment({
      email: parsed.data.email,
      courseId,
      addedBy: actor.userId,
    });
  }
  return new Response(null, { status: 201 });
}

export const Route = createFileRoute('/api/admin/users')({
  server: {
    handlers: {
      GET: ({ request }) => getUsersHandler(request),
      POST: ({ request }) => postUserHandler(request),
    },
  },
});
