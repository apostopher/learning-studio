import { getCourseRoleNames, getStaffCourseIds } from '#/db/course-staff';
import {
  getRoleNamesForProfile,
  getUserPermissions,
  hasPermission,
} from '#/db/permissions';
import { getUserRoleNames } from '#/db/user-roles';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  hasAdminAccess,
  isCourseScopedEntity,
  OWNER_ROLE,
  type PermissionAction,
  type PermissionEntity,
} from '#/lib/admin-schemas';
import { auth } from '#/lib/auth';

export interface PermittedActor {
  userId: string;
  roles: string[];
  permissions: Set<string>;
  isOwner: boolean;
}

/**
 * Server-only permission guard. Every user/enrolment handler calls this first.
 *
 * Mirrors `requireAdmin` — same `ForbiddenError`, same self-guarding shape —
 * rather than returning a permission set for the caller to inspect: a handler
 * that forgets to check what it was handed silently allows everything, which
 * is the exact failure guards exist to prevent.
 *
 * An owner bypasses the permission lookup entirely.
 */
export async function requirePermission(
  headers: Headers,
  entity: PermissionEntity,
  action: PermissionAction,
): Promise<PermittedActor> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();

  const roles = await getUserRoleNames(userId);
  // Admin-or-owner is the floor: permissions refine what an admin may do, they
  // never grant the admin surface to someone who isn't one.
  if (!hasAdminAccess(roles)) throw new ForbiddenError();

  const permissions = await getUserPermissions(roles);
  if (!hasPermission(permissions, entity, action)) throw new ForbiddenError();

  return {
    userId,
    roles,
    permissions,
    isOwner: roles.includes(OWNER_ROLE),
  };
}

/**
 * An actor whose authority was resolved against ONE specific course.
 *
 * `permissions` is course-scoped despite being structurally identical to the
 * org-wide set `requirePermission` returns: it is derived from the union of
 * global and per-course roles, so it means "grants valid on this course". Never
 * carry it to another course — re-run the guard with that course's id. `roles`
 * stays global-only and `courseRoles` holds the roles held here, so a caller
 * can tell org-wide authority from authority on this one course.
 */
export type CourseActor = PermittedActor & { courseRoles: string[] };

/**
 * Guard for the per-course entities: `structure`, `content`, `staff`.
 *
 * Deliberately has NO admin floor. `requirePermission`'s floor exists because
 * its entities refine what an admin may do; these entities are held by people
 * who are not admins at all — a subject expert is staff on one course and
 * nothing anywhere else. Requiring admin here would make the two new roles
 * inert, which is the failure this whole design exists to avoid.
 *
 * Authority is the union of the actor's global roles and their roles on THIS
 * course, so an owner (wildcard) passes, and an admin passes only for entities
 * their global role was actually granted.
 *
 * `courseRoles` rides along on the returned actor so a caller can tell "allowed
 * because they own the deployment" from "allowed because they are the professor
 * on this one course" — the staff-appointment guard turns on that difference.
 */
export async function requireCoursePermission(
  headers: Headers,
  courseId: number,
  entity: PermissionEntity,
  action: PermissionAction,
): Promise<CourseActor> {
  // A caller reaching this guard with an org-level entity is a wiring mistake,
  // not a denied request: `course_staff` has nothing to say about `user` or
  // `enrolment`, so the union below would judge the actor against grants that
  // do not apply. A plain Error on purpose — `ForbiddenError` would dress the
  // bug up as a 403 and it would read as the guard working correctly.
  if (!isCourseScopedEntity(entity)) {
    throw new Error(
      `requireCoursePermission called with '${entity}', which is not course-scoped`,
    );
  }

  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();

  const [globalRoles, courseRoles] = await Promise.all([
    getUserRoleNames(userId),
    getCourseRoleNames(userId, courseId),
  ]);

  // No role anywhere — globally or on this course — is no authority at all.
  // Refusing here rather than asking for the grants of an empty role list keeps
  // the join off the path of every ordinary learner, and fails closed if a
  // permission lookup ever starts answering generously for `[]`.
  const roles = [...globalRoles, ...courseRoles];
  if (roles.length === 0) throw new ForbiddenError();

  const permissions = await getUserPermissions(roles);
  if (!hasPermission(permissions, entity, action)) throw new ForbiddenError();

  return {
    userId,
    roles: globalRoles,
    courseRoles,
    permissions,
    isOwner: globalRoles.includes(OWNER_ROLE),
  };
}

/**
 * The courses this actor is staffed on. Empty for everyone else, and for a
 * request with no session at all.
 *
 * Not a guard — it grants nothing and throws nothing. It answers the one
 * question `/admin`'s course list needs after `course:read` has been refused:
 * *is there a narrower set of courses this person may still see?* Session
 * resolution lives here beside the guards rather than in the route, so a
 * handler never reaches for `auth` itself.
 */
export async function getStaffScopedCourseIds(
  headers: Headers,
): Promise<number[]> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) return [];
  return [...(await getStaffCourseIds(userId))];
}

/** Owner-only guard, for role assignment and permission editing. */
export async function requireOwner(
  headers: Headers,
): Promise<{ userId: string; roles: string[] }> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();
  const roles = await getUserRoleNames(userId);
  if (!roles.includes(OWNER_ROLE)) throw new ForbiddenError();
  return { userId, roles };
}

/**
 * Refuse to act on a privileged target unless you are the owner.
 *
 * "Privileged" means a GLOBAL role only. `getRoleNamesForProfile` reads
 * `user_profile_roles`, which by construction never contains a course-scoped
 * role — those live in `course_staff`. That separation is load-bearing: if a
 * professor counted as privileged here, the admins who hired them could not
 * enrol them, set their pilot level, or fix their profile, and the *student*
 * half of a staff account would become unadministrable.
 */
export async function assertCanActOnProfile(
  actor: PermittedActor,
  targetProfileId: number,
): Promise<void> {
  if (actor.isOwner) return;
  const targetRoles = await getRoleNamesForProfile(targetProfileId);
  if (targetRoles.length > 0) throw new ForbiddenError();
}
