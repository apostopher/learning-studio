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
 * Staff on ANY course.
 *
 * Used only by the lesson-material parser, which takes a file and returns
 * generated material without persisting anything and without carrying a course
 * id of any kind. Course-scoping it would mean inventing an identifier the
 * client does not have, for a route that writes nothing.
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
 */
export async function assignCourseStaff(
  input: AssignCourseStaffInput,
): Promise<
  { ok: true } | { ok: false; reason: 'not-found' | 'not-assignable' }
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
