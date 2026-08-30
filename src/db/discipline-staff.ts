import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import { disciplineStaffTable, userRolesTable } from '#/db/schema';

/**
 * The roles this person holds ON this discipline. Empty for everyone else.
 *
 * Mirrors `getCourseRoleNames` exactly, scoped to `discipline_staff` instead
 * of `course_staff`. Runs on every lesson-content request once a lesson
 * resolves to a non-null discipline, which is why
 * `discipline_staff_user_discipline_idx` exists.
 */
export async function getDisciplineRoleNames(
  userId: string,
  disciplineId: number,
): Promise<string[]> {
  const rows = await db
    .select({ name: userRolesTable.name })
    .from(disciplineStaffTable)
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, disciplineStaffTable.roleId),
    )
    .where(
      and(
        eq(disciplineStaffTable.userId, userId),
        eq(disciplineStaffTable.disciplineId, disciplineId),
      ),
    );
  return rows.map((r) => r.name);
}

/**
 * The distinct staff roles this person holds anywhere, across every
 * discipline.
 *
 * Mirrors `getStaffRoleNames` in `course-staff.ts`, and for the same reason:
 * its one caller (`hasDisciplinePermissionAnywhere`) answers a question that
 * has no discipline in it — "may this person do X on ANY discipline?" — and
 * grants are keyed on the role name alone in `role_permissions`. Returning
 * pairs would invite a caller to treat the set as authority on a specific
 * discipline, which it is not.
 */
export async function getStaffRoleNames(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: userRolesTable.name })
    .from(disciplineStaffTable)
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, disciplineStaffTable.roleId),
    )
    .where(eq(disciplineStaffTable.userId, userId));
  return rows.map((r) => r.name);
}
