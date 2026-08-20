import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { createCourse, listAdminCourses } from '#/db/admin';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  createCourseInputSchema,
  type PermissionAction,
} from '#/lib/admin-schemas';
import { requirePermission } from '#/lib/permissions.server';

// `course` is org-level, not course-scoped (see COURSE_SCOPED_ENTITIES in
// admin-schemas): this route holds no course id, and a role scoped to a
// course cannot authorize creating the course it would be scoped to. So this
// goes through `requirePermission`, keeping its admin floor — listing and
// creating courses is a university act.
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

export async function listAdminCoursesHandler(
  request: Request,
): Promise<Response> {
  const denied = await guard(request, 'read');
  if (denied) return denied;
  return Response.json(await listAdminCourses());
}

export async function createCourseHandler(request: Request): Promise<Response> {
  const denied = await guard(request, 'create');
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createCourseInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(await createCourse(parsed.data, getActiveOrgId()));
}

export const Route = createFileRoute('/api/admin/courses')({
  server: {
    handlers: {
      GET: ({ request }) => listAdminCoursesHandler(request),
      POST: ({ request }) => createCourseHandler(request),
    },
  },
});
