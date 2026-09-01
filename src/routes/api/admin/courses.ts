import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { createCourse, listAdminCourses } from '#/db/admin';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { createCourseInputSchema } from '#/lib/admin-schemas';
import {
  getStaffScopedCourseIds,
  requireCourseCreation,
  requirePermission,
} from '#/lib/permissions.server';

// `course` is org-level, not course-scoped (see COURSE_SCOPED_ENTITIES in
// admin-schemas): this route holds no course id, and a role scoped to a
// course cannot authorize creating the course it would be scoped to.
//
// Which is why CREATE does not go through `requirePermission`. That guard
// carries an admin floor, refusing anyone who is not admin or owner before it
// looks at a grant — so a course manager could never pass it, and RBAC rule 5
// says they may create an offering. `requireCourseCreation` is the union that
// admits them; see its note for why a subject expert is not included.
//
// READ keeps `requirePermission` and its floor, inline in the handler below,
// with its own staff fallback for an actor holding no `course:read`.
/** RBAC rule 5: a course manager or an admin may create a new offering. */
async function guardCreate(request: Request): Promise<Response | null> {
  try {
    await requireCourseCreation(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

/**
 * The catalogue for an actor with `course:read`; otherwise, the courses this
 * actor is staffed on — and nothing else.
 *
 * `/admin` now admits course-scoped staff (see `_authed/admin.tsx`), and a
 * subject expert deliberately holds no `course:read`: that grant is the whole
 * catalogue, which is exactly what "a Biology SME cannot teach Computer
 * Science" says they must not have. Narrowing the existing endpoint rather
 * than adding a `/my-courses` sibling keeps one URL, one query hook and one
 * page: the response shape is identical, so nothing on the client branches.
 *
 * Staff on zero courses is still a 403. They cannot reach this page — the
 * route guard turns on the same `course_staff` rows — so the only way here is
 * a session whose staffing was revoked after it loaded, and answering `[]`
 * would show that person an empty catalogue as though none existed.
 */
export async function listAdminCoursesHandler(
  request: Request,
): Promise<Response> {
  try {
    await requirePermission(request.headers, 'course', 'read');
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
    const staffCourseIds = await getStaffScopedCourseIds(request.headers);
    if (staffCourseIds.length === 0) {
      return new Response('Forbidden', { status: 403 });
    }
    return Response.json(await listAdminCourses(staffCourseIds));
  }
  return Response.json(await listAdminCourses());
}

export async function createCourseHandler(request: Request): Promise<Response> {
  const denied = await guardCreate(request);
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
