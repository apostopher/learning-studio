import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { deleteCourse, updateCourse } from '#/db/admin';
import { ForbiddenError } from '#/lib/admin-functions.server';
import type { PermissionAction } from '#/lib/admin-schemas';
import { updateCourseInputSchema } from '#/lib/admin-schemas';
import { requirePermission } from '#/lib/permissions.server';

// `course` is org-level, not course-scoped (see COURSE_SCOPED_ENTITIES in
// admin-schemas): creating/renaming/deleting a course row is an
// administrative act, not authorship of its content, so this goes through
// `requirePermission`, not `requireCoursePermission`.
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

export async function patchCourseHandler(
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
  const parsed = updateCourseInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = await updateCourse(courseId, parsed.data);
  if (!updated) return new Response('Not found', { status: 404 });
  return Response.json(updated);
}

export async function deleteCourseHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  const denied = await guard(request, 'delete');
  if (denied) return denied;

  const deleted = await deleteCourse(courseId);
  if (!deleted) return new Response('Not found', { status: 404 });
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/courses/$courseId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchCourseHandler(request, params.courseId),
      DELETE: ({ request, params }) =>
        deleteCourseHandler(request, params.courseId),
    },
  },
});
