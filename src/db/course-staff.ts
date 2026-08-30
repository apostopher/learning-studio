import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseStaffTable,
  coursesTable,
  userProfileTable,
  userRolesTable,
} from '#/db/schema';
import { isCourseScopedRole } from '#/lib/admin-schemas';

export type CourseStaffMember = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
};

export type AssignCourseStaffInput = {
  userId: string;
  courseId: number;
  roleName: string;
  assignedBy: string;
};

/**
 * The roles this person holds ON this course. Empty for everyone else.
 *
 * This runs on every gated request for a signed-in user, which is why
 * `course_staff_user_course_idx` exists.
 */
export async function getCourseRoleNames(
  userId: string,
  courseId: number,
): Promise<string[]> {
  const rows = await db
    .select({ name: userRolesTable.name })
    .from(courseStaffTable)
    .innerJoin(userRolesTable, eq(userRolesTable.id, courseStaffTable.roleId))
    .where(
      and(
        eq(courseStaffTable.userId, userId),
        eq(courseStaffTable.courseId, courseId),
      ),
    );
  return rows.map((r) => r.name);
}

/** Does this person hold any staff role on this course? Drives the gate bypass. */
export async function isCourseStaff(
  userId: string,
  courseId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: courseStaffTable.id })
    .from(courseStaffTable)
    .where(
      and(
        eq(courseStaffTable.userId, userId),
        eq(courseStaffTable.courseId, courseId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Does this person hold any staff role on the course with this SLUG?
 *
 * A slug-keyed sibling of `isCourseStaff` rather than a caller-side
 * `getCourseIdentityBySlug` + `isCourseStaff` pair, because `/api/course/details`
 * asks this for EVERY non-admin request — it has to, since the answer also
 * ships in the payload to tell the sidebar whether it is drawing an author's
 * view — and two round trips on that path would be two too many. An unknown
 * slug simply matches no row, so the caller fails closed without a separate
 * existence check.
 */
export async function isCourseStaffBySlug(
  userId: string,
  courseSlug: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: courseStaffTable.id })
    .from(courseStaffTable)
    .innerJoin(coursesTable, eq(coursesTable.id, courseStaffTable.courseId))
    .where(
      and(
        eq(courseStaffTable.userId, userId),
        eq(coursesTable.slug, courseSlug),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Every course this person is staffed on, in one query.
 *
 * `getMyCourses` decides the author bypass once for a LIST of course cards,
 * so asking `isCourseStaff` per card would be an N+1 on /app — the app's
 * landing page. One indexed read on `course_staff.user_id` answers all of
 * them; the caller tests membership per card.
 */
export async function getStaffCourseIds(userId: string): Promise<Set<number>> {
  const rows = await db
    .select({ courseId: courseStaffTable.courseId })
    .from(courseStaffTable)
    .where(eq(courseStaffTable.userId, userId));
  return new Set(rows.map((r) => r.courseId));
}

/**
 * Every course this person is staffed on, as slugs.
 *
 * The slug-keyed sibling of `getStaffCourseIds`, for the enrolment guard on
 * `/course/$courseSlug`, which holds a slug and compares against a list of
 * them. Resolving ids to slugs caller-side would be a second round trip on the
 * critical path of every course navigation; this is one indexed read on
 * `course_staff.user_id` with the course join the caller would have had to do
 * anyway.
 */
export async function getStaffCourseSlugs(userId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: coursesTable.slug })
    .from(courseStaffTable)
    .innerJoin(coursesTable, eq(coursesTable.id, courseStaffTable.courseId))
    .where(eq(courseStaffTable.userId, userId));
  return rows.map((r) => r.slug);
}

/**
 * Staff on ANY course.
 *
 * Two callers, both of which genuinely have no course id to scope by:
 *
 * - `resolveAuthContext`, which answers `/admin`'s route guard. Entering the
 *   admin console is not a per-course question — which course is decided,
 *   per request, by `requireCoursePermission`. A boolean is all the router
 *   may hold; a list of ids would be a second copy of course-scoped
 *   authority living on the client.
 * - `isStaffAnywhere`, which answers "teaching side or stranger?" for the
 *   blob-upload token endpoint (a blob key carries no course id) and for the
 *   lesson/module routes deciding whether an absent row may be reported as a
 *   404 at all.
 *
 * NOT for anything that turns on a specific GRANT. Holding a `course_staff`
 * row says nothing about which of `structure`/`content`/`staff` the role
 * behind it was given — resolve that with `getUserPermissions`/`hasPermission`
 * in `permissions.server.ts` against a real role list: `requireCoursePermission`
 * for a known course, or `getCourseRoleNames` unioned across every course a
 * user is staffed on if a future caller genuinely needs "any course, any
 * grant" (the last function that answered that, `hasCoursePermissionAnywhere`,
 * was deleted as dead code once its one caller stopped needing it).
 */
export async function isAnyCourseStaff(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: courseStaffTable.id })
    .from(courseStaffTable)
    .where(eq(courseStaffTable.userId, userId))
    .limit(1);
  return row !== undefined;
}

/**
 * Everyone staffed on a course, one entry per person with their roles collected.
 *
 * A single join, unlike `listUsers`' four separate queries: that function
 * de-dupes a user × roles × courses × levels cartesian product spanning every
 * account in the org, where the join multiplies rows well past what's cheap to
 * ship over the wire. Here the query is already scoped to one course and the
 * only multiplicity is roles-per-person-per-course — at most two, since
 * `COURSE_SCOPED_ROLES` has two entries. A join stays small and reads as one
 * query instead of three round trips to assemble by hand.
 */
export async function listCourseStaff(
  courseId: number,
): Promise<CourseStaffMember[]> {
  const rows = await db
    .select({
      userId: courseStaffTable.userId,
      email: userProfileTable.email,
      firstName: userProfileTable.firstName,
      lastName: userProfileTable.lastName,
      role: userRolesTable.name,
    })
    .from(courseStaffTable)
    .innerJoin(userRolesTable, eq(userRolesTable.id, courseStaffTable.roleId))
    .innerJoin(
      userProfileTable,
      eq(userProfileTable.userId, courseStaffTable.userId),
    )
    .where(eq(courseStaffTable.courseId, courseId));

  const byUser = new Map<string, CourseStaffMember>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (existing) {
      existing.roles.push(row.role);
      continue;
    }
    byUser.set(row.userId, {
      userId: row.userId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      roles: [row.role],
    });
  }
  return Array.from(byUser.values());
}

/**
 * Add a staff assignment. Idempotent — re-assigning the same role is a no-op.
 *
 * `requireCoursePermission` unions an actor's global roles with their
 * `course_staff` roles on the course in question, then asks
 * `getUserPermissions` for the combined set — and that function returns
 * `Set(['*'])` the instant `owner` appears anywhere in the list. A
 * `course_staff` row naming `owner` (or `admin`) would therefore grant
 * unconditional authority that merely *looks* course-scoped. Refusing
 * anything outside `COURSE_SCOPED_ROLES` here closes that off at the write,
 * not only at whichever route happens to call this.
 *
 * An unknown `userId` is reported, not raised. `course_staff.user_id` is a
 * foreign key into `user_profiles`, so the insert would otherwise throw a
 * constraint violation nobody catches and a bad id in the request body would
 * read as a server fault — the same reason `courseExists` exists for the admin
 * level route.
 */
export async function assignCourseStaff(
  input: AssignCourseStaffInput,
): Promise<
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-assignable' | 'unknown-user' }
> {
  if (!isCourseScopedRole(input.roleName)) {
    return { ok: false, reason: 'not-assignable' };
  }

  const [role] = await db
    .select({ id: userRolesTable.id })
    .from(userRolesTable)
    .where(eq(userRolesTable.name, input.roleName))
    .limit(1);
  if (!role) return { ok: false, reason: 'not-found' };

  const [profile] = await db
    .select({ id: userProfileTable.id })
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, input.userId))
    .limit(1);
  if (!profile) return { ok: false, reason: 'unknown-user' };

  await db
    .insert(courseStaffTable)
    .values({
      userId: input.userId,
      courseId: input.courseId,
      roleId: role.id,
      assignedBy: input.assignedBy,
    })
    .onConflictDoNothing({
      target: [
        courseStaffTable.userId,
        courseStaffTable.courseId,
        courseStaffTable.roleId,
      ],
    });
  return { ok: true };
}

/** Remove one staff assignment. Silent when the row is already gone. */
export async function removeCourseStaff(
  userId: string,
  courseId: number,
  roleName: string,
): Promise<void> {
  const [role] = await db
    .select({ id: userRolesTable.id })
    .from(userRolesTable)
    .where(eq(userRolesTable.name, roleName))
    .limit(1);
  if (!role) return;

  await db
    .delete(courseStaffTable)
    .where(
      and(
        eq(courseStaffTable.userId, userId),
        eq(courseStaffTable.courseId, courseId),
        eq(courseStaffTable.roleId, role.id),
      ),
    );
}
