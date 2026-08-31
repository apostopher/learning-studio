import {
  getCourseRoleNames,
  getStaffCourseIds,
  isAnyCourseStaff,
  isCourseManagerAnywhere,
} from '#/db/course-staff';
import {
  getDisciplineRoleNames,
  isAnyDisciplineStaff,
} from '#/db/discipline-staff';
import {
  getRoleNamesForProfile,
  getUserPermissions,
  hasPermission,
} from '#/db/permissions';
import { getUserRoleNames } from '#/db/user-roles';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import {
  hasAdminAccess,
  isCourseScopedEntity,
  isDisciplineScopedEntity,
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
 * The resolution shared by every scope-qualified guard (course, discipline,
 * and any future one): union the actor's global roles with whatever roles
 * they hold in the given scope, then check the grant against that union.
 *
 * `requireCoursePermission` and `requireDisciplinePermission` differ only in
 * three things — which entities are valid to ask about, how to fetch the
 * scoped roles, and what to call the guard in the tripwire message — all
 * captured in `config`. Extracted because these are the system's only two
 * authorization guards below `requirePermission`, and this policy (same
 * `ForbiddenError`, same anonymous-first refusal, same empty-role
 * short-circuit, same non-`ForbiddenError` tripwire) drifting between them is
 * exactly the shape of mistake `d4f767d` was: a hardening or a fix applied to
 * one guard silently not applying to its sibling.
 *
 * Not exported: callers get a scope-shaped actor from the two wrappers below,
 * never this raw resolution.
 */
async function requireScopedPermission(
  headers: Headers,
  entity: PermissionEntity,
  action: PermissionAction,
  config: {
    guardName: string;
    scopeLabel: string;
    isScoped: (entity: PermissionEntity) => boolean;
    getScopedRoles: (userId: string) => Promise<string[]>;
  },
): Promise<{
  userId: string;
  globalRoles: string[];
  scopedRoles: string[];
  permissions: Set<string>;
}> {
  // A caller reaching this guard with an entity its scope has nothing to say
  // about is a wiring mistake, not a denied request: the union below would
  // judge the actor against grants that do not apply. A plain Error on
  // purpose — `ForbiddenError` would dress the bug up as a 403 and it would
  // read as the guard working correctly.
  //
  // It therefore surfaces as an uncaught 500, deliberately: every route's
  // `catch` maps only `ForbiddenError`. No caller in the tree trips it today,
  // so it is a tripwire for a future route author, not a runtime branch — if
  // you see this 500, the route is asking the wrong guard, not refusing a
  // request.
  if (!config.isScoped(entity)) {
    throw new Error(
      `${config.guardName} called with '${entity}', which is not ${config.scopeLabel}`,
    );
  }

  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();

  const [globalRoles, scopedRoles] = await Promise.all([
    getUserRoleNames(userId),
    config.getScopedRoles(userId),
  ]);

  // No role anywhere — globally or in this scope — is no authority at all.
  // Refusing here rather than asking for the grants of an empty role list keeps
  // the join off the path of every ordinary learner, and fails closed if a
  // permission lookup ever starts answering generously for `[]`.
  const roles = [...globalRoles, ...scopedRoles];
  if (roles.length === 0) throw new ForbiddenError();

  const permissions = await getUserPermissions(roles);
  // RBAC rule 3: an admin may CRUD every lesson and every course's structure.
  //
  // A BYPASS, not a floor — the distinction matters and the two are easy to
  // confuse. A floor (as in `requirePermission`) REQUIRES admin and would make
  // the two scoped roles inert. This admits an admin in ADDITION to whoever
  // the grant lets through, so a subject expert with no global role still
  // passes on their `discipline_staff` row and a course manager on their
  // `course_staff` row, exactly as before.
  //
  // It exists because `admin` holds no `structure` or `content` grant at all
  // (`migrate-staff-roles.ts:78`, which withheld them so that senior staff
  // would administer rather than author). That rule has been superseded: an
  // admin who cannot drag a lesson into a course or fix a typo in one is not
  // an administrator of this system in any useful sense. The audit trail
  // argument the old note made — "an admin who needs a course's authority
  // assigns themselves, leaving a record in course_staff.assigned_by" — was
  // never enforcement, only bookkeeping, and it cost the admin every ordinary
  // corrective action in the product.
  //
  // `globalRoles`, never `roles`: admin is a global role, and reading the
  // union would let a `course_staff` row naming a role called `admin` mint
  // org-wide authority from a course-scoped grant.
  if (
    !hasAdminAccess(globalRoles) &&
    !hasPermission(permissions, entity, action)
  ) {
    throw new ForbiddenError();
  }

  return { userId, globalRoles, scopedRoles, permissions };
}

/**
 * Guard for the per-course entities: `structure`, `content`, `staff`.
 *
 * Deliberately has NO admin FLOOR. `requirePermission`'s floor exists because
 * its entities refine what an admin may do; these entities are held by people
 * who are not admins at all — a subject expert is staff on one course and
 * nothing anywhere else. Requiring admin here would make the two new roles
 * inert, which is the failure this whole design exists to avoid.
 *
 * It does carry an admin BYPASS, which is the opposite arrangement: see
 * `requireScopedPermission`. An admin passes on top of, never instead of, the
 * scoped roles.
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
  const { userId, globalRoles, scopedRoles, permissions } =
    await requireScopedPermission(headers, entity, action, {
      guardName: 'requireCoursePermission',
      scopeLabel: 'course-scoped',
      isScoped: isCourseScopedEntity,
      getScopedRoles: (userId) => getCourseRoleNames(userId, courseId),
    });

  return {
    userId,
    roles: globalRoles,
    courseRoles: scopedRoles,
    permissions,
    isOwner: globalRoles.includes(OWNER_ROLE),
  };
}

/**
 * Guard for the one per-DISCIPLINE entity: `content`.
 *
 * Mirrors `requireCoursePermission` in shape and failure mode — same
 * `ForbiddenError`, same union-of-global-and-scoped-roles resolution, same
 * tripwire against a caller asking the wrong guard — scoped to
 * `discipline_staff` instead of `course_staff`. Both share their resolution
 * via `requireScopedPermission`; this wrapper supplies only what differs.
 *
 * Deliberately has NO admin FLOOR, for the same reason `requireCoursePermission`
 * has none: requiring admin would make the subject-expert role inert.
 *
 * It DOES admit an admin by bypass (see `requireScopedPermission`), which is
 * RBAC rule 3 — an admin may CRUD every lesson. That supersedes the older
 * arrangement in which `admin` was withheld `content` entirely and an admin
 * needing a discipline's authority appointed themselves a subject-expert to
 * leave a record in `discipline_staff.assigned_by`. Appointment still leaves
 * that record and is still how a NON-admin gains authority; it is simply no
 * longer the only way an admin can fix a lesson.
 *
 * Returns void rather than an actor (contrast `requireCoursePermission`,
 * which returns `CourseActor`): its one caller,
 * `requireLessonContentPermission`, has no further use for the resolved role
 * list. Widen this the day a caller does.
 */
export async function requireDisciplinePermission(
  headers: Headers,
  disciplineId: number,
  entity: PermissionEntity,
  action: PermissionAction,
): Promise<void> {
  await requireScopedPermission(headers, entity, action, {
    guardName: 'requireDisciplinePermission',
    scopeLabel: 'discipline-scoped',
    isScoped: isDisciplineScopedEntity,
    getScopedRoles: (userId) => getDisciplineRoleNames(userId, disciplineId),
  });
}

/**
 * THE lesson-content guard. Authority follows the lesson's DISCIPLINE, not
 * any one course teaching it: once several courses can teach the same lesson
 * via `module_lessons`, "who may edit it" has to have exactly one answer, and
 * a lesson has exactly one discipline (or none).
 *
 * `disciplineId === null` is the one case with no SME to ask — an "Untitled"
 * lesson, which is a triage queue — so authority falls back to org-level
 * `requireAdmin`.
 *
 * This null-branch is encoded in exactly ONE place on purpose. The prior
 * incident on this exact branch (commit d4f767d, reverted) came from every
 * lesson-content route independently deciding "org-owned, so `requireAdmin`
 * unconditionally" — which took authorship away from Subject Experts on
 * every disciplined lesson, not only the Untitled ones, and broke the
 * docx→material workflow because the parse step required `content:create`,
 * which admins do not hold. Every lesson-content route must call this
 * function rather than hand-rolling the null check again.
 *
 * Takes an already-RESOLVED `disciplineId`, not a `lessonId`: resolving one
 * (and telling "no such lesson" apart from "lesson has no discipline" — they
 * get different answers, 404 vs admin-only) is
 * `getDisciplineIdForLessonId`'s job in `db/lesson-access.ts`. The caller
 * must turn a not-found lookup into a 404 (via `absentResourceResponse`)
 * BEFORE ever reaching this function.
 */
export async function requireLessonContentPermission(
  headers: Headers,
  disciplineId: number | null,
  action: PermissionAction,
): Promise<void> {
  if (disciplineId === null) {
    await requireAdmin(headers);
    return;
  }
  await requireDisciplinePermission(headers, disciplineId, 'content', action);
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

/**
 * Is this caller staff ANYWHERE — admin or owner globally, or holding any
 * `course_staff` OR `discipline_staff` row at all?
 *
 * The honest bound for a route that has no course id to scope by. It grants
 * nothing on any particular course or discipline; it answers only "is this
 * person part of the teaching side of the deployment, or a stranger?" Three
 * kinds of caller need that: the blob-upload token endpoint (a blob pathname
 * carries no course id), the lesson/module routes deciding whether a missing
 * row may be reported as a 404 rather than a flat 403, and the docx-parse
 * route's pre-body-parsing floor.
 *
 * Checks `discipline_staff` as well as `course_staff`, not either alone: the
 * two tables are deliberately independent (see `migrate-discipline-staff.ts`
 * — no backfill, because there is no source of truth linking them), so a
 * discipline-only SME can hold zero `course_staff` rows. Checking only
 * `course_staff` here would read that SME as a stranger at every "is staff
 * somewhere" gate — the `/admin` shell's entry guard and the docx-parse
 * floor among them — even though `requireLessonContentPermission` would
 * correctly admit them the moment a lesson id resolves their discipline.
 *
 * False for an anonymous request, and it never throws for one: the session
 * lookup is optional-chained, so nothing downstream runs without a user id.
 */
export async function isStaffAnywhere(headers: Headers): Promise<boolean> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) return false;
  const roles = await getUserRoleNames(userId);
  return (
    hasAdminAccess(roles) ||
    (await isAnyCourseStaff(userId)) ||
    (await isAnyDisciplineStaff(userId))
  );
}

/**
 * The response for a course-scoped route whose lesson or module id resolved to
 * no course — i.e. the row does not exist.
 *
 * 404 is the useful answer and the wrong one to give everybody. These handlers
 * resolve the row BEFORE guarding (guarding on a null course id would
 * misreport "no such lesson" as "forbidden"), which means an unauthenticated
 * caller could previously walk sequential integer ids and read the id space
 * straight off the status code — 404 absent, 403 present. That is the same
 * oracle `routes/_authed/course.$courseSlug.tsx` refuses to be.
 *
 * So the fidelity is kept for the people who need it — anyone on the teaching
 * side — and everyone else gets the flat 403 they would have got had the row
 * existed. Fails closed: a caller with no session is not staff.
 */
export async function absentResourceResponse(
  headers: Headers,
  error: string,
): Promise<Response> {
  if (await isStaffAnywhere(headers)) {
    return Response.json({ error }, { status: 404 });
  }
  return new Response('Forbidden', { status: 403 });
}

/**
 * RBAC rule 1: a course manager, a subject expert, or an admin may CREATE a
 * discipline.
 *
 * The guard form of `isStaffAnywhere`, and it is exactly that union — admin or
 * owner globally, any `course_staff` row, any `discipline_staff` row — because
 * `course_staff` can only ever name a course manager or a subject expert
 * (`COURSE_SCOPED_ROLES`) and `discipline_staff` only a subject expert
 * (`DISCIPLINE_SCOPED_ROLES`). "Staff anywhere" and "one of those three
 * populations" are the same set, enforced at both write sites.
 *
 * Creating a discipline is widened; renaming, deleting, and appointing its
 * experts are NOT — those stay `requireAdmin`. Naming a new subject is
 * cheap and reversible by its author. Appointing experts is the act that
 * hands out authority, and letting an SME do it would make expert assignment
 * self-propagating: the "an admin hires the experts" rule would hold exactly
 * until the first hire.
 */
export async function requireDisciplineCreation(
  headers: Headers,
): Promise<void> {
  if (!(await isStaffAnywhere(headers))) throw new ForbiddenError();
}

/**
 * RBAC rule 5: a course manager or an admin may create a new offering.
 *
 * Not `requirePermission(headers, 'course', 'create')` alone, which carries an
 * ADMIN FLOOR — it refuses anyone who is not admin or owner before it ever
 * looks at a grant, so a course manager could never pass it however the grants
 * were configured. The union adds the course-manager role and nothing else; a
 * subject expert is deliberately absent, authoring lessons rather than
 * deciding which courses the org sells.
 *
 * `isCourseManagerAnywhere` and not `isAnyCourseStaff`: the latter is also
 * true of a subject expert staffed on a course, which would admit exactly the
 * population this rule leaves out.
 */
export async function requireCourseCreation(headers: Headers): Promise<void> {
  try {
    await requirePermission(headers, 'course', 'create');
    return;
  } catch (error) {
    // Only a refusal falls through. Anything else is an outage, and reporting
    // it as "not an admin" would hide it behind a second failing question.
    if (!(error instanceof ForbiddenError)) throw error;
  }

  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();
  if (!(await isCourseManagerAnywhere(userId))) throw new ForbiddenError();
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
