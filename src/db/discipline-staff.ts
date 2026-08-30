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
 * Staff on ANY discipline.
 *
 * Mirrors `isAnyCourseStaff` exactly, scoped to `discipline_staff` instead of
 * `course_staff`. Its one caller is `isStaffAnywhere`: a user can legitimately
 * hold a `discipline_staff` row and zero `course_staff` rows (the two tables
 * are deliberately independent — see `migrate-discipline-staff.ts`'s doc
 * comment on why there is no backfill linking them), so `isStaffAnywhere`
 * must check both or a discipline-only SME reads as a stranger everywhere it
 * is asked: refused at any route gated on "is staff somewhere" (the
 * docx-parse floor, the `/admin` shell) even though `requireLessonContentPermission`
 * would correctly admit them once a lesson id resolves their discipline.
 *
 * NOT for anything that turns on a specific GRANT — same caveat as
 * `isAnyCourseStaff`. Resolve that with `requireDisciplinePermission` for a
 * known discipline.
 */
export async function isAnyDisciplineStaff(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: disciplineStaffTable.id })
    .from(disciplineStaffTable)
    .where(eq(disciplineStaffTable.userId, userId))
    .limit(1);
  return row !== undefined;
}
