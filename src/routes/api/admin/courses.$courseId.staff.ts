import { createFileRoute } from '@tanstack/react-router';
import {
  assignCourseStaff,
  listCourseStaff,
  removeCourseStaff,
} from '#/db/course-staff';
import { addUserEnrolment } from '#/db/users';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  hasAdminAccess,
  SUBJECT_EXPERT_ROLE,
  setCourseStaffInputSchema,
} from '#/lib/admin-schemas';
import {
  type CourseActor,
  requireCoursePermission,
} from '#/lib/permissions.server';

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Course-staff guard — returns the resolved actor, or the 403 Response. */
async function guard(
  request: Request,
  courseId: number,
  action: 'create' | 'read' | 'delete',
): Promise<CourseActor | Response> {
  try {
    return await requireCoursePermission(
      request.headers,
      courseId,
      'staff',
      action,
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

export async function getCourseStaffHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }

  const actor = await guard(request, courseId, 'read');
  if (actor instanceof Response) return actor;

  return Response.json(await listCourseStaff(courseId));
}

/**
 * Assign a course-scoped staff role. An admin (or owner) may appoint either
 * role on any course; a subject expert may bring in a course manager on
 * their own courses — see the self-propagation guard rail below.
 *
 * Also enrols the appointee in the course, idempotently. Staff are also
 * students: the course route redirects anyone not subscribed to `/app`, and
 * `getMyCourses` is driven off `course_subscriptions`, so a staffed-but-
 * unenrolled professor would be bounced before any of the authoring work
 * they were just assigned becomes reachable, and would have no card on
 * `/app` either.
 */
export async function putCourseStaffHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }

  const actor = await guard(request, courseId, 'create');
  if (actor instanceof Response) return actor;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = setCourseStaffInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  /**
   * An SME may bring in an assistant, not appoint a peer.
   *
   * Without this, role assignment is self-propagating: a subject expert
   * could grant another person full authority over their subject with no
   * admin involvement, and the "admin hires professors" rule would hold only
   * until the first professor was hired.
   */
  const isGlobalStaff = hasAdminAccess(actor.roles);
  if (!isGlobalStaff && parsed.data.role === SUBJECT_EXPERT_ROLE) {
    return Response.json(
      { error: 'Only an admin or owner can appoint a subject expert.' },
      { status: 403 },
    );
  }

  const result = await assignCourseStaff({
    userId: parsed.data.userId,
    courseId,
    roleName: parsed.data.role,
    assignedBy: actor.userId,
  });
  if (!result.ok) {
    if (result.reason === 'not-assignable') {
      return Response.json(
        { error: 'Role is not course-assignable' },
        { status: 400 },
      );
    }
    return Response.json({ error: 'Role not found' }, { status: 404 });
  }

  await addUserEnrolment({
    userId: parsed.data.userId,
    courseId,
    grantedBy: actor.userId,
  });

  return new Response(null, { status: 204 });
}

/**
 * Remove a course-scoped staff role.
 *
 * Deliberately does NOT un-enrol: someone who stops being a professor may
 * still legitimately be a learner on that course, and silently revoking
 * their access would destroy their progress visibility.
 */
export async function deleteCourseStaffHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }

  const actor = await guard(request, courseId, 'delete');
  if (actor instanceof Response) return actor;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = setCourseStaffInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await removeCourseStaff(parsed.data.userId, courseId, parsed.data.role);
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/courses/$courseId/staff')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getCourseStaffHandler(request, params.courseId),
      PUT: ({ request, params }) =>
        putCourseStaffHandler(request, params.courseId),
      DELETE: ({ request, params }) =>
        deleteCourseStaffHandler(request, params.courseId),
    },
  },
});
