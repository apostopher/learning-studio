import { createFileRoute } from '@tanstack/react-router';
import {
  assignCourseStaff,
  listCourseStaff,
  removeCourseStaff,
} from '#/db/course-staff';
import { hasPermission } from '#/db/permissions';
import { addUserEnrolment } from '#/db/users';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  COURSE_MANAGER_ROLE,
  COURSE_SCOPED_ROLES,
  type CourseScopedRole,
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

/**
 * The course-scoped roles this actor may add or take away on this course.
 *
 * ONE function for both verbs, because spec §3 gives `subject-expert`
 * "CRD (own courses, **CRS-MGR only**)" — that qualifier governs all three
 * verbs, not just create. Splitting it produced exactly the drift it warns
 * about: create was railed and delete was not, so a subject expert could
 * remove every OTHER subject expert from their own course and become its sole
 * authority. That is the self-propagation hole the PUT rail closes, running in
 * reverse and worse, since removal is destructive and immediate.
 *
 * The permission is checked per verb rather than assumed: `staff:read`,
 * `staff:create` and `staff:delete` are independently grantable in the
 * permission grid, so someone may legitimately see the roster and add to it
 * without being able to take anything away.
 */
function courseRolesActorMayChange(
  actor: CourseActor,
  action: 'create' | 'delete',
): CourseScopedRole[] {
  if (!hasPermission(actor.permissions, 'staff', action)) return [];
  return hasAdminAccess(actor.roles)
    ? [...COURSE_SCOPED_ROLES]
    : [COURSE_MANAGER_ROLE];
}

/**
 * Roles this actor may appoint here. An admin or owner may appoint either; a
 * subject expert may bring in a course manager and never a peer.
 *
 * Read both by the GET that renders the role picker and by the PUT that
 * enforces the write, so the panel can never offer an option the write
 * refuses. Two derivations of the same policy is how they drift apart.
 */
export function assignableCourseRoles(actor: CourseActor): CourseScopedRole[] {
  return courseRolesActorMayChange(actor, 'create');
}

/**
 * Roles this actor may take away here — the same asymmetry as appointment.
 *
 * A role SET, not the boolean this used to be: an SME may remove their own
 * assistant but not a fellow professor, and a flat "can remove" cannot say
 * that. The panel gates each badge's Remove control on membership, and
 * `deleteCourseStaffHandler` refuses anything outside it — with one exception
 * both of them make: the actor's OWN badges, which are always removable,
 * because resigning cannot escalate anybody.
 */
export function removableCourseRoles(actor: CourseActor): CourseScopedRole[] {
  return courseRolesActorMayChange(actor, 'delete');
}

/**
 * The roster, plus what this actor may do with it.
 *
 * `assignableRoles`, `removableRoles` and `selfUserId` ship with the roster
 * rather than being derived on the client because all three depend on
 * `course_staff`, on grants resolved for THIS course, or on the session —
 * none of which the browser holds.
 */
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

  return Response.json({
    staff: await listCourseStaff(courseId),
    assignableRoles: assignableCourseRoles(actor),
    removableRoles: removableCourseRoles(actor),
    // Who the panel is drawing FOR, so it can offer the one removal the role
    // rail exempts: their own. The browser holds no trustworthy copy of the
    // session user id, and deriving it client-side would let the resignation
    // control be pointed at someone else.
    selfUserId: actor.userId,
  });
}

/**
 * Assign a course-scoped staff role. An admin (or owner) may appoint either
 * role on any course; a subject expert may bring in a course manager on
 * their own courses — see the self-propagation guard rail below.
 *
 * Enrols the appointee too, but ONLY when the actor actually holds
 * `enrolment:create`. Spec §3 gives `subject-expert` no enrolment authority at
 * all, and an unconditional enrol handed them the effect of one: appoint
 * anyone as a course manager, a `course_subscriptions` row is written, remove
 * the staff role again — `deleteCourseStaffHandler` deliberately does not
 * un-enrol — and the access survives permanently. With the whole org directory
 * in the person picker that is a free-access dispenser held by someone with no
 * enrolment grant and no admin in the loop.
 *
 * The reason it was unconditional is gone: `getSubscribedCourseSlugs` now
 * unions the courses someone is staffed on, so a professor reaches their own
 * course whether or not a subscription row exists. An SME's appointee still
 * needs an admin to enrol them as a *learner*, which is what spec §5
 * describes.
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
   *
   * Asked of `assignableCourseRoles` — the same function that tells the panel
   * which roles to offer — so the picker can never show an option this
   * refuses, and tightening the rule cannot leave a stale control behind.
   */
  if (!assignableCourseRoles(actor).includes(parsed.data.role)) {
    return Response.json(
      {
        error:
          parsed.data.role === SUBJECT_EXPERT_ROLE
            ? 'Only an admin or owner can appoint a subject expert.'
            : 'You cannot assign that role on this course.',
      },
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
    if (result.reason === 'unknown-user') {
      // 404, not the 500 the `course_staff.user_id` foreign key would have
      // raised: a user id the directory doesn't know is a bad request body,
      // and must not read as a server fault.
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    return Response.json({ error: 'Role not found' }, { status: 404 });
  }

  // Enrolment is a separate authority from appointment — see the doc comment.
  if (hasPermission(actor.permissions, 'enrolment', 'create')) {
    await addUserEnrolment({
      userId: parsed.data.userId,
      courseId,
      grantedBy: actor.userId,
    });
  }

  return new Response(null, { status: 204 });
}

/**
 * Remove a course-scoped staff role.
 *
 * Deliberately does NOT un-enrol: someone who stops being a professor may
 * still legitimately be a learner on that course, and silently revoking
 * their access would destroy their progress visibility.
 *
 * Railed identically to appointment — see `courseRolesActorMayChange`. An SME
 * may dismiss their assistant; only an admin or owner may unseat a PEER.
 *
 * Removing YOURSELF is exempt, whatever the role. The rail exists to stop
 * privilege escalation — an SME must not mint or unseat a fellow professor.
 * Stepping down is privilege reduction, which that rule has nothing to say
 * about, and without the exemption a departing professor cannot resign: only
 * an admin can take the role off them, including off themselves.
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

  /**
   * The mirror of the PUT rail, asked of the same function that tells the
   * panel which Remove controls to draw. Without it a subject expert could
   * clear every peer off their own course — no admin involved, nothing
   * recoverable, and the roster the next professor never appears on.
   *
   * Self-removal skips the rail: resigning is the one removal that cannot
   * escalate anyone. The check is on the actor's own id, so it cannot be
   * spent on anybody else's row.
   */
  const isSelfRemoval = parsed.data.userId === actor.userId;
  if (
    !isSelfRemoval &&
    !removableCourseRoles(actor).includes(parsed.data.role)
  ) {
    return Response.json(
      {
        error:
          parsed.data.role === SUBJECT_EXPERT_ROLE
            ? 'Only an admin or owner can remove a subject expert.'
            : 'You cannot remove that role on this course.',
      },
      { status: 403 },
    );
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
