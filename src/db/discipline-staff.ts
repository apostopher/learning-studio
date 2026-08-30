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
