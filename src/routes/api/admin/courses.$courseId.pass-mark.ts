import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { updateCoursePassMark } from '#/db/course';
import { ForbiddenError } from '#/lib/admin-functions.server';
import type { PermissionAction } from '#/lib/admin-schemas';
import { updatePassMarkInputSchema } from '#/lib/admin-schemas';
import { requirePermission } from '#/lib/permissions.server';

// Org-level `course` permission, same as renaming a course (see
// `courses.$courseId.ts`).
async function guard(
  request: Request,
  action: PermissionAction,
): Promise<Response | null> {
  try {
    await requirePermission(request.headers, 'course', action);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function putPassMarkHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  const denied = await guard(request, 'update');
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = updatePassMarkInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { passMark } = parsed.data;
  const updated = await updateCoursePassMark(courseId, passMark);
  if (!updated) return new Response('Not found', { status: 404 });
  return Response.json({ passMark });
}

export const Route = createFileRoute('/api/admin/courses/$courseId/pass-mark')({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        putPassMarkHandler(request, params.courseId),
    },
  },
});
